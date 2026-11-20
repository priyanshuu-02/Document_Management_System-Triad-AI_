import json
import logging
from bson import ObjectId
from app.db import get_db, get_fs
from app.models.document import DocumentModel
from app.services.ocr_service import OCRService

logger = logging.getLogger(__name__)

def check_access(db, doc, current_user):
    """
    Helper to determine if current_user has download rights to doc:
    1. Admin user -> Allowed
    2. User belongs to same division -> Allowed
    3. User has an approved access request -> Allowed
    """
    if not current_user:
        return False, False

    user_role = current_user.get("role", "user")
    user_division = current_user.get("division")
    doc_division = doc.get("division")

    if user_role == "admin" or user_division == doc_division:
        return True, False

    user_id = str(current_user.get("_id", current_user.get("user_id", "")))
    if not user_id:
        return False, False

    doc_id_str = str(doc.get("_id"))
    or_doc = [{"doc_id": doc_id_str}]
    if ObjectId.is_valid(doc_id_str):
        or_doc.append({"doc_id": ObjectId(doc_id_str)})

    or_user = [{"requested_by_id": user_id}]
    if ObjectId.is_valid(user_id):
        or_user.append({"requested_by_id": ObjectId(user_id)})

    # A user can accumulate several requests for one document over time
    # (e.g. rejected, then re-requested and approved).  Look for each status
    # explicitly so an older rejected/revoked request never masks a newer
    # approval.
    def has_request(status):
        return db.access_requests.find_one({
            "$and": [{"$or": or_doc}, {"$or": or_user}, {"status": status}]
        }) is not None

    if has_request("approved"):
        return True, False
    if has_request("pending"):
        return False, True
    return False, False


def approved_doc_ids(db, current_user) -> list:
    """ObjectIds of other-division documents this user has approved access to."""
    if not current_user:
        return []
    user_id = str(current_user.get("_id", current_user.get("user_id", "")))
    if not user_id:
        return []
    or_user = [{"requested_by_id": user_id}]
    if ObjectId.is_valid(user_id):
        or_user.append({"requested_by_id": ObjectId(user_id)})
    ids = []
    for req in db.access_requests.find({"$or": or_user, "status": "approved"}, {"doc_id": 1}):
        doc_id = str(req.get("doc_id"))
        if ObjectId.is_valid(doc_id):
            ids.append(ObjectId(doc_id))
    return ids


def build_metadata_text(metadata: dict) -> str:
    """Flatten dynamic metadata into one searchable string ("Key: value | ...")."""
    return " | ".join(f"{key}: {value}" for key, value in (metadata or {}).items())


def backfill_metadata_text(db) -> int:
    """Add ``metadata_text`` to documents uploaded before it existed."""
    updated = 0
    for doc in db.documents.find({"metadata_text": {"$exists": False}}, {"metadata": 1}):
        db.documents.update_one({"_id": doc["_id"]},
                                {"$set": {"metadata_text": build_metadata_text(doc.get("metadata"))}})
        updated += 1
    return updated

class DocumentService:
    @staticmethod
    def upload_document(file, metadata_input, current_user=None):
        if not file or not file.filename:
            return {"error": "A valid file is required"}, 400

        # Parse dynamic metadata JSON or dict
        metadata = {}
        if isinstance(metadata_input, dict):
            metadata = metadata_input
        elif isinstance(metadata_input, str) and metadata_input.strip():
            try:
                metadata = json.loads(metadata_input)
            except Exception:
                return {"error": "Invalid metadata JSON string"}, 400

        # Determine target division and enforce RBAC rules.
        # Regular users are restricted to their own division; admins can specify a target division.
        requested_division = metadata.get("Division") or (current_user.get("division") if current_user else "General")

        if current_user:
            user_division = current_user.get("division")
            user_role = current_user.get("role", "user")

            # RBAC Rule: A user from Division A can only upload documents to Division A.
            # Only administrators can upload to other divisions.
            if user_role != "admin" and requested_division and requested_division.strip() != user_division:
                return {
                    "error": f"Permission denied: As a member of '{user_division}', you can only upload documents to '{user_division}'."
                }, 403
            final_division = user_division if user_role != "admin" else (requested_division or user_division)
            uploaded_by = str(current_user.get("_id", current_user.get("user_id", "")))
        else:
            return {"error": "Authentication required"}, 401

        # Save the finalized division into the metadata dictionary
        metadata["Division"] = final_division

        # Read binary file content into memory
        file_bytes = file.read()
        file_size = len(file_bytes)
        filename = file.filename
        content_type = file.content_type or "application/octet-stream"

        # Step 1: Run OCR to pull plain text from the file for search indexing
        extracted_text = OCRService.extract_text(file_bytes, filename=filename, content_type=content_type)

        # Step 2: Store the actual file binary in MongoDB GridFS to avoid document size limits
        fs = get_fs()
        gridfs_id = fs.put(file_bytes, filename=filename, content_type=content_type)

        # Step 3: Save the document metadata and OCR text into the documents collection
        doc_record = DocumentModel.create_doc(
            filename=filename,
            content_type=content_type,
            gridfs_id=gridfs_id,
            file_size=file_size,
            division=final_division,
            metadata=metadata,
            ocr_text=extracted_text,
            uploaded_by=uploaded_by
        )

        # Denormalised copy of the dynamic metadata so search can run inside
        # MongoDB instead of scanning every document in Python.
        doc_record["metadata_text"] = build_metadata_text(metadata)

        db = get_db()
        result = db.documents.insert_one(doc_record)
        doc_record["_id"] = result.inserted_id

        logger.info(f"Document uploaded: {filename} (id: {result.inserted_id}) in {final_division}")
        return {
            "message": "Document uploaded successfully",
            "document": DocumentModel.sanitize(doc_record, current_user_division=final_division, has_approved_access=True)
        }, 201

    @staticmethod
    def list_documents(current_user=None, division_filter=None, metadata_filters=None):
        db = get_db()
        query = {}

        user_division = current_user.get("division") if current_user else None
        user_role = current_user.get("role", "user") if current_user else "user"
        # Other-division documents this user was explicitly approved for
        approved_object_ids = approved_doc_ids(db, current_user)

        if user_role == "admin":
            # Admin can see all divisions or filter by division
            if division_filter:
                query["division"] = division_filter
        else:
            # STRICT DIVISION ISOLATION (Point 1):
            # Regular users can ONLY see their own division's documents,
            # or documents from other divisions they have been explicitly APPROVED for!
            if approved_object_ids:
                query["$or"] = [
                    {"division": user_division},
                    {"_id": {"$in": approved_object_ids}}
                ]
            else:
                query["division"] = user_division

        # Support dynamic metadata filters (e.g. ?Report Type=Financial)
        if metadata_filters:
            for key, val in metadata_filters.items():
                if val:
                    query[f"metadata.{key}"] = val

        docs = list(db.documents.find(query).sort("created_at", -1))
        
        sanitized_list = []
        for d in docs:
            can_download, has_pending = check_access(db, d, current_user)
            sanitized_list.append(
                DocumentModel.sanitize(
                    d, 
                    current_user_division=user_division, 
                    has_approved_access=can_download, 
                    has_pending_request=has_pending
                )
            )

        return {"documents": sanitized_list, "total": len(sanitized_list)}, 200

    @staticmethod
    def get_document_details(doc_id: str, current_user=None):
        db = get_db()
        try:
            doc = db.documents.find_one({"_id": ObjectId(doc_id)})
        except Exception:
            doc = None

        if not doc:
            return {"error": "Document not found"}, 404

        if not current_user:
            return {"error": "Authentication required"}, 401

        user_division = current_user.get("division") if current_user else None
        can_download, has_pending = check_access(db, doc, current_user)

        return {
            "document": DocumentModel.sanitize(
                doc, 
                current_user_division=user_division, 
                has_approved_access=can_download,
                has_pending_request=has_pending
            )
        }, 200

    @staticmethod
    def download_document(doc_id: str, current_user=None):
        db = get_db()
        try:
            doc = db.documents.find_one({"_id": ObjectId(doc_id)})
        except Exception:
            doc = None

        if not doc:
            return {"error": "Document not found"}, 404

        can_download, _ = check_access(db, doc, current_user)
        if not can_download:
            return {
                "error": f"Access denied: Document belongs to '{doc.get('division')}'. Please submit an access request."
            }, 403

        # Stream file from GridFS
        fs = get_fs()
        try:
            grid_id = doc.get("gridfs_id")
            if isinstance(grid_id, str) and ObjectId.is_valid(grid_id):
                grid_id = ObjectId(grid_id)
            grid_file = fs.get(grid_id)
            file_data = grid_file.read()
            return {
                "file_data": file_data,
                "filename": doc.get("filename", "downloaded_file"),
                "content_type": doc.get("content_type", "application/octet-stream")
            }, 200
        except Exception as e:
            logger.error(f"GridFS retrieval failed for {doc_id}: {e}")
            return {"error": f"Failed to retrieve file from storage: {str(e)}"}, 500
