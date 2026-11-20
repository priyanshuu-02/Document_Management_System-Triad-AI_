from datetime import datetime, timezone
from bson import ObjectId

class DocumentModel:
    @staticmethod
    def create_doc(filename: str, content_type: str, gridfs_id: ObjectId, file_size: int,
                   division: str, metadata: dict, ocr_text: str = "", uploaded_by: str = "") -> dict:
        return {
            "filename": filename,
            "content_type": content_type or "application/octet-stream",
            "gridfs_id": gridfs_id,
            "file_size": file_size,
            "division": division,
            "metadata": metadata or {},
            "ocr_text": ocr_text or "",
            "uploaded_by": str(uploaded_by),
            "created_at": datetime.now(timezone.utc)
        }

    @staticmethod
    def sanitize(doc: dict, current_user_division: str = None, has_approved_access: bool = False, has_pending_request: bool = False) -> dict:
        if not doc:
            return {}
        
        doc_division = doc.get("division", "")
        # Can download if in the same division or access approved
        can_download = (current_user_division == doc_division) or has_approved_access
        raw_ocr = doc.get("ocr_text", "")

        return {
            "id": str(doc.get("_id")),
            "filename": doc.get("filename", ""),
            "content_type": doc.get("content_type", ""),
            "file_size": doc.get("file_size", 0),
            "division": doc_division,
            "metadata": doc.get("metadata", {}),
            "ocr_text": raw_ocr if can_download else "",
            "ocr_restricted": not can_download,
            "uploaded_by": str(doc.get("uploaded_by", "")),
            "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else str(doc.get("created_at", "")),
            "can_download": can_download,
            "requires_access": not can_download,
            "has_pending_request": has_pending_request
        }
