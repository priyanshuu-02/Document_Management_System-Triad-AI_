"""How an audit log entry is stored. These are only ever added, never changed."""
from datetime import datetime, timezone


class AuditLogModel:

    @staticmethod
    def create_event(event_type, request_doc, actor, note=None):
        return {
            "event_type": event_type,
            "request_id": str(request_doc.get("_id", "")),
            "doc_id": str(request_doc.get("doc_id", "")),
            "doc_filename": request_doc.get("doc_filename", ""),
            "doc_division": request_doc.get("doc_division", ""),
            "subject_user_id": str(request_doc.get("requested_by_id", "")),
            "subject_username": request_doc.get("requested_by_username", ""),
            "actor_id": str(actor.get("_id", actor.get("user_id", ""))),
            "actor_username": actor.get("username", "Unknown"),
            "note": note or None,
            "created_at": datetime.now(timezone.utc),
        }

    @staticmethod
    def sanitize(event):
        created_at = event.get("created_at")
        return {
            "id": str(event.get("_id", "")),
            "event_type": event.get("event_type", ""),
            "request_id": str(event.get("request_id", "")),
            "doc_id": str(event.get("doc_id", "")),
            "doc_filename": event.get("doc_filename", ""),
            "doc_division": event.get("doc_division", ""),
            "subject_user_id": str(event.get("subject_user_id", "")),
            "subject_username": event.get("subject_username", ""),
            "actor_id": str(event.get("actor_id", "")),
            "actor_username": event.get("actor_username", ""),
            "old_role": event.get("old_role"),
            "new_role": event.get("new_role"),
            "old_division": event.get("old_division"),
            "new_division": event.get("new_division"),
            "note": event.get("note"),
            "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at or ""),
        }
