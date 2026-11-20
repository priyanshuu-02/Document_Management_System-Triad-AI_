"""Access request workflow.

A user from another division asks for a document (pending). A member or
admin of the document's division approves or rejects it. An admin can later
revoke an approval. Every step is written to the audit log.
"""
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
        # Audit records are only ever added, never edited or deleted, so the
        # history of who did what can't be changed later.
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

        # People in the same division can already open it, so no request is needed.
        if user_division == doc_division:
            return {"message": "You already belong to this division and have full access."}, 200

        # Don't create a second request if one is already approved or waiting.
        # An old rejected or revoked request doesn't count, so the user can ask again.
        base = {"doc_id": str(doc["_id"]), "requested_by_id": user_id}
        approved = db.access_requests.find_one({**base, "status": AccessRequestModel.STATUS_APPROVED})
        if approved:
            return {"message": "Access has already been approved for this document.", "request": AccessRequestModel.sanitize(approved)}, 200
        pending = db.access_requests.find_one({**base, "status": AccessRequestModel.STATUS_PENDING})
        if pending:
            return {"message": "Access request is already pending review.", "request": AccessRequestModel.sanitize(pending)}, 200

        # Save the new request as "pending"
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

        # Record it in the audit log
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

        # Admins see every request. Everyone else only sees requests for their
        # own division's documents (a user without a division sees none).
        query = {}
        if user_role != "admin":
            if not user_division:
                return {"requests": [], "total": 0}, 200
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
