from flask import Blueprint, request, jsonify
from app.services.access_service import AccessService
from app.middleware.auth_middleware import token_required, admin_required

access_bp = Blueprint("access", __name__, url_prefix="/api/access")

@access_bp.route("/request", methods=["POST"])
@token_required
def create_access_request():
    data = request.get_json(silent=True) or {}
    doc_id = data.get("doc_id")
    current_user = getattr(request, "current_user", {})

    res, status_code = AccessService.create_request(doc_id, current_user)
    return jsonify(res), status_code

@access_bp.route("/approve", methods=["POST"])
@token_required
def approve_access_request():
    data = request.get_json(silent=True) or {}
    request_id = data.get("request_id")
    current_user = getattr(request, "current_user", None)

    res, status_code = AccessService.approve_request(request_id, current_user, data.get("note"))
    return jsonify(res), status_code

@access_bp.route("/reject", methods=["POST"])
@token_required
def reject_access_request():
    data = request.get_json(silent=True) or {}
    request_id = data.get("request_id")
    current_user = getattr(request, "current_user", None)

    res, status_code = AccessService.reject_request(request_id, current_user, data.get("note"))
    return jsonify(res), status_code

@access_bp.route("/revoke", methods=["POST"])
@admin_required
def revoke_access_request():
    data = request.get_json(silent=True) or {}
    res, status_code = AccessService.revoke_request(data.get("request_id"), request.current_user, data.get("note"))
    return jsonify(res), status_code

@access_bp.route("/inbox", methods=["GET"])
@token_required
def get_division_inbox():
    current_user = getattr(request, "current_user", {})
    res, status_code = AccessService.get_division_inbox(current_user)
    return jsonify(res), status_code

@access_bp.route("/my-requests", methods=["GET"])
@token_required
def get_sent_requests():
    current_user = getattr(request, "current_user", {})
    res, status_code = AccessService.get_sent_requests(current_user)
    return jsonify(res), status_code
