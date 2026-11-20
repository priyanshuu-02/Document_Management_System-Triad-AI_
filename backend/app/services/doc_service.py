"""Document rules: who can see a document, uploading, listing and downloading."""
import json
import logging
from bson import ObjectId
from app.db import get_db, get_fs
from app.models.document import DocumentModel
from app.services.ocr_service import OCRService
from app.validation import clean_metadata, clean_filename, is_safe_key, text
from app.seed import division_allowed

logger = logging.getLogger(__name__)

class AccessContext:
    """Works out what one user may open, for a whole list of documents.

    It loads all of the user's approved and pending requests with one
    database query, then checks each document in memory. Before, every
    document needed its own queries, which made search take about 10 seconds.
    """

    def __init__(self, db, current_user):
        self.user = current_user
        self.is_admin = bool(current_user) and current_user.get("role", "user") == "admin"
        self.division = current_user.get("division") if current_user else None
        self.approved = set()   # doc ids (str) with an approved request
        self.pending = set()    # doc ids (str) with a pending request

        if not current_user or self.is_admin:
            return
        user_id = str(current_user.get("_id", current_user.get("user_id", "")))
        if not user_id:
            return
        or_user = [{"requested_by_id": user_id}]
        if ObjectId.is_valid(user_id):
            or_user.append({"requested_by_id": ObjectId(user_id)})
        # A user may have several requests for the same document over time
        # (say, rejected first and approved later). We keep approved and
        # pending ones in separate lists, so an old rejection never hides
        # a newer approval.
        for req in db.access_requests.find(
            {"$or": or_user, "status": {"$in": ["approved", "pending"]}},
            {"doc_id": 1, "status": 1},
        ):
            target = self.approved if req.get("status") == "approved" else self.pending
            target.add(str(req.get("doc_id")))

    def check(self, doc):
        """Return (can_download, has_pending_request) for one document.

        1. Admin -> allowed
        2. Same division -> allowed
        3. Approved access request -> allowed
        """
        if not self.user:
            return False, False
        if self.is_admin or self.division == doc.get("division"):
            return True, False
        doc_id = str(doc.get("_id"))
        if doc_id in self.approved:
            return True, False
        return False, doc_id in self.pending

    def approved_object_ids(self) -> list:
        return [ObjectId(i) for i in self.approved if ObjectId.is_valid(i)]


def check_access(db, doc, current_user):
    """(can_download, has_pending_request) for a single document."""
    return AccessContext(db, current_user).check(doc)


def approved_doc_ids(db, current_user) -> list:
    """ObjectIds of other-division documents this user has approved access to."""
    return AccessContext(db, current_user).approved_object_ids()


def build_metadata_text(metadata: dict) -> str:
    """Turn the metadata into one line of text for search, e.g. "Report Type: Audit | Fiscal Year: 2025"."""
    return " | ".join(f"{key}: {value}" for key, value in (metadata or {}).items())


def backfill_metadata_text(db) -> int:
    """Fill in metadata_text for older documents that were saved without it."""
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
        if not current_user:
            return {"error": "Authentication required"}, 401

        # The metadata can arrive as a JSON string or an already-parsed dict.
        if isinstance(metadata_input, str) and metadata_input.strip():
            try:
                metadata_input = json.loads(metadata_input)
            except ValueError:
                return {"error": "Invalid metadata JSON string"}, 400
        metadata, error = clean_metadata(metadata_input or {})
        if error:
            return {"error": error}, 400

        # Division rule: a normal user can only upload into their own division.
        # Only an admin may pick another division.
        user_division = current_user.get("division") or ""
        is_admin = current_user.get("role", "user") == "admin"
        requested_division = metadata.get("Division") or user_division

        if not is_admin and requested_division != user_division:
            return {
                "error": f"Permission denied: As a member of '{user_division}', you can only upload documents to '{user_division}'."
            }, 403
        final_division = requested_division if is_admin else user_division
        if not final_division:
            return {"error": "A Division is required"}, 400
        if is_admin and not division_allowed(get_db(), final_division):
            return {"error": f"'{final_division}' is not one of the configured divisions"}, 400
        uploaded_by = str(current_user.get("_id", current_user.get("user_id", "")))

        # The division always lives in the metadata too, so it can be filtered on.
        metadata["Division"] = final_division

        # Fields the admin marked as "required" must have a value.
        for field in get_db().metadata_fields.find({"required": True}, {"name": 1}):
            if not metadata.get(field["name"]):
                return {"error": f"'{field['name']}' is required"}, 400

        file_bytes = file.read()
        file_size = len(file_bytes)
        if file_size == 0:
            return {"error": "The uploaded file is empty"}, 400
        filename = clean_filename(file.filename)
        content_type = text(file.content_type, 100) or "application/octet-stream"

        # Step 1: pull the text out of the file (PDF text or OCR) so it can be searched.
        extracted_text = OCRService.extract_text(file_bytes, filename=filename, content_type=content_type)

        # Step 2: store the file itself in GridFS (MongoDB's file storage).
        fs = get_fs()
        gridfs_id = fs.put(file_bytes, filename=filename, content_type=content_type)

        # Step 3: save the document's details (metadata, OCR text, file id).
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

        # Also keep all metadata as one line of text, so search can look
        # through every field with a single database query.
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
        access = AccessContext(db, current_user)
        approved_object_ids = access.approved_object_ids()

        if user_role == "admin":
            # Admins see every division, and can narrow it down to one.
            if division_filter:
                query["division"] = str(division_filter)
        else:
            # Normal users see their own division, plus any other-division
            # documents they were approved for.
            if approved_object_ids:
                query["$or"] = [
                    {"division": user_division},
                    {"_id": {"$in": approved_object_ids}}
                ]
            else:
                query["division"] = user_division

        # Any metadata field can be used as a filter, e.g. ?Report Type=Financial.
        # Unsafe field names (starting with "$" or containing ".") are ignored.
        for key, val in (metadata_filters or {}).items():
            if val and is_safe_key(key):
                query[f"metadata.{key.strip()}"] = str(val)

        docs = list(db.documents.find(query).sort("created_at", -1))
        
        sanitized_list = []
        for d in docs:
            can_download, has_pending = access.check(d)
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

        # Read the file back from GridFS
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
            # Log the real reason, but don't show internal details to the user.
            logger.error(f"GridFS retrieval failed for {doc_id}: {e}")
            return {"error": "Failed to retrieve the file from storage"}, 500
