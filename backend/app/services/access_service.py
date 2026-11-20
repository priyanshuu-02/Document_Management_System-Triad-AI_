import logging
from datetime import datetime, timezone
from bson import ObjectId
from app.db import get_db
from app.models.access_request import AccessRequestModel
from app.models.audit_log import AuditLogModel

logger = logging.getLogger(__name__)

class AccessService:
    @staticmethod
    def _write_audit_event(db, event_type, req, actor, note=None):
        # The application never updates or deletes audit_events: every access
        # decision produces a new immutable record.
        db.audit_events.insert_one(AuditLogModel.create_event(event_type, req, actor, note))

    @staticmethod
    def create_request(doc_id: str, current_user: dict):
        if not doc_id:
            return {"error": "doc_id is required"}, 400

        db = get_db()
        try:
            doc = db.documents.find_one({"_id": ObjectId(doc_id)})
        except Exception:
            doc = None

        if not doc:
            return {"error": "Target document not found"}, 404

        user_id = str(current_user.get("_id", current_user.get("user_id", "")))
        user_division = current_user.get("division", "")
        doc_division = doc.get("division", "")

        # If user is in the same division, they already have full download & view permissions
        if user_division == doc_division:
            return {"message": "You already belong to this division and have full access."}, 200

        # Prevent duplicate requests.  Query each live status explicitly: an
        # older rejected/revoked request must not hide a current approval or
        # pending request (and must not block a fresh request either).
        base = {"doc_id": str(doc["_id"]), "requested_by_id": user_id}
        approved = db.access_requests.find_one({**base, "status": AccessRequestModel.STATUS_APPROVED})
        if approved:
            return {"message": "Access has already been approved for this document.", "request": AccessRequestModel.sanitize(approved)}, 200
        pending = db.access_requests.find_one({**base, "status": AccessRequestModel.STATUS_PENDING})
        if pending:
            return {"message": "Access request is already pending review.", "request": AccessRequestModel.sanitize(pending)}, 200

        # Save the new pending request in MongoDB
        req_doc = AccessRequestModel.create_request(
            doc_id=str(doc["_id"]),
            doc_filename=doc.get("filename", "Untitled Document"),
            doc_division=doc_division,
            user_id=user_id,
            username=current_user.get("username", "Unknown"),
            user_division=user_division
        )

        res = db.access_requests.insert_one(req_doc)
        req_doc["_id"] = res.inserted_id

        # Write an immutable audit log entry for this request
        AccessService._write_audit_event(db, "access_requested", req_doc, current_user)

        return {
            "message": "Access request submitted successfully",
            "request": AccessRequestModel.sanitize(req_doc)
        }, 201

    @staticmethod
    def approve_request(request_id: str, current_user: dict, note: str = None):
        """
        Approve an access request.
        Only division members (or admins) of the requested document can approve it.
        """
        if not request_id:
            return {"error": "request_id is required"}, 400

        db = get_db()
        try:
            req = db.access_requests.find_one({"_id": ObjectId(request_id)})
        except Exception:
            req = None

        if not req:
            return {"error": "Access request not found"}, 404

        user_division = current_user.get("division")
        user_role = current_user.get("role", "user")
        target_division = req.get("doc_division")
        if user_role != "admin" and user_division != target_division:
            return {"error": f"Permission denied: Only members or admins of '{target_division}' can approve this request."}, 403
        if req.get("status") != AccessRequestModel.STATUS_PENDING:
            return {"error": "Only pending access requests can be approved."}, 409

        reviewer_name = current_user.get("username", "Unknown")

        db.access_requests.update_one(
            {"_id": ObjectId(request_id)},
            {
                "$set": {
                    "status": AccessRequestModel.STATUS_APPROVED,
                    "reviewed_by": reviewer_name,
                    "reviewed_at": datetime.now(timezone.utc),
                    "review_note": (note or "").strip() or None
                }
            }
        )

        updated_req = db.access_requests.find_one({"_id": ObjectId(request_id)})
        AccessService._write_audit_event(db, "access_approved", updated_req, current_user, note)
        return {
            "message": "Access request approved successfully",
            "request": AccessRequestModel.sanitize(updated_req)
        }, 200

    @staticmethod
    def reject_request(request_id: str, current_user: dict, note: str = None):
        if not request_id:
            return {"error": "request_id is required"}, 400

        db = get_db()
        try:
            req = db.access_requests.find_one({"_id": ObjectId(request_id)})
        except Exception:
            req = None

        if not req:
            return {"error": "Access request not found"}, 404

        user_division = current_user.get("division")
        user_role = current_user.get("role", "user")
        target_division = req.get("doc_division")
        if user_role != "admin" and user_division != target_division:
            return {"error": f"Permission denied: Only members or admins of '{target_division}' can reject this request."}, 403
        if req.get("status") != AccessRequestModel.STATUS_PENDING:
            return {"error": "Only pending access requests can be rejected."}, 409

        reviewer_name = current_user.get("username", "Unknown")

        db.access_requests.update_one(
            {"_id": ObjectId(request_id)},
            {
                "$set": {
                    "status": AccessRequestModel.STATUS_REJECTED,
                    "reviewed_by": reviewer_name,
                    "reviewed_at": datetime.now(timezone.utc),
                    "review_note": (note or "").strip() or None
                }
            }
        )

        updated_req = db.access_requests.find_one({"_id": ObjectId(request_id)})
        AccessService._write_audit_event(db, "access_rejected", updated_req, current_user, note)
        return {
            "message": "Access request rejected",
            "request": AccessRequestModel.sanitize(updated_req)
        }, 200

    @staticmethod
    def revoke_request(request_id: str, current_user: dict, note: str = None):
        if not request_id:
            return {"error": "request_id is required"}, 400
        db = get_db()
        try:
            req = db.access_requests.find_one({"_id": ObjectId(request_id)})
        except Exception:
            req = None
        if not req:
            return {"error": "Access request not found"}, 404
        if req.get("status") != AccessRequestModel.STATUS_APPROVED:
            return {"error": "Only approved access can be revoked."}, 409

        db.access_requests.update_one(
            {"_id": req["_id"], "status": AccessRequestModel.STATUS_APPROVED},
            {"$set": {
                "status": AccessRequestModel.STATUS_REVOKED,
                "revoked_by": current_user.get("username", "Unknown"),
                "revoked_at": datetime.now(timezone.utc),
                "revocation_note": (note or "").strip() or None,
            }}
        )
        updated_req = db.access_requests.find_one({"_id": req["_id"]})
        AccessService._write_audit_event(db, "access_revoked", updated_req, current_user, note)
        return {"message": "Approved access revoked successfully", "request": AccessRequestModel.sanitize(updated_req)}, 200

    @staticmethod
    def get_division_inbox(current_user: dict):
        user_division = current_user.get("division")
        user_role = current_user.get("role", "user")
        db = get_db()

        query = {}
        if user_role != "admin" and user_division:
            # Show requests for documents owned by this division
            query["doc_division"] = user_division

        requests_list = list(db.access_requests.find(query).sort("created_at", -1))
        return {
            "requests": [AccessRequestModel.sanitize(r) for r in requests_list],
            "total": len(requests_list)
        }, 200

    @staticmethod
    def get_sent_requests(current_user: dict):
        user_id = str(current_user.get("_id", current_user.get("user_id", "")))
        db = get_db()
        or_user = [{"requested_by_id": user_id}]
        if ObjectId.is_valid(user_id):
            or_user.append({"requested_by_id": ObjectId(user_id)})
        requests_list = list(db.access_requests.find({"$or": or_user}).sort("created_at", -1))
        return {
            "requests": [AccessRequestModel.sanitize(r) for r in requests_list],
            "total": len(requests_list)
        }, 200
