from datetime import datetime, timezone
from bson import ObjectId

class AccessRequestModel:
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_REVOKED = "revoked"

    @staticmethod
    def create_request(doc_id: str, doc_filename: str, doc_division: str,
                       user_id: str, username: str, user_division: str) -> dict:
        return {
            "doc_id": str(doc_id),
            "doc_filename": doc_filename,
            "doc_division": doc_division,
            "requested_by_id": str(user_id),
            "requested_by_username": username,
            "requester_division": user_division,
            "status": AccessRequestModel.STATUS_PENDING,
            "reviewed_by": None,
            "reviewed_at": None,
            "review_note": None,
            "revoked_by": None,
            "revoked_at": None,
            "revocation_note": None,
            "created_at": datetime.now(timezone.utc)
        }

    @staticmethod
    def sanitize(req: dict) -> dict:
        if not req:
            return {}
        return {
            "id": str(req.get("_id")),
            "doc_id": str(req.get("doc_id", "")),
            "doc_filename": req.get("doc_filename", ""),
            "doc_division": req.get("doc_division", ""),
            "requested_by_id": str(req.get("requested_by_id", "")),
            "requested_by_username": req.get("requested_by_username", ""),
            "requester_division": req.get("requester_division", ""),
            "status": req.get("status", "pending"),
            "reviewed_by": req.get("reviewed_by"),
            "reviewed_at": req.get("reviewed_at").isoformat() if isinstance(req.get("reviewed_at"), datetime) else None,
            "review_note": req.get("review_note"),
            "revoked_by": req.get("revoked_by"),
            "revoked_at": req.get("revoked_at").isoformat() if isinstance(req.get("revoked_at"), datetime) else None,
            "revocation_note": req.get("revocation_note"),
            "created_at": req.get("created_at").isoformat() if isinstance(req.get("created_at"), datetime) else str(req.get("created_at", ""))
        }
