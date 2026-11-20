"""Cross-division access requests: ask, approve, reject, revoke, and the two lists.

The rules (who may approve what) live in access_service.py.
"""
from flask import Blueprint, request, jsonify
from app.services.access_service import AccessService
from app.middleware.auth_middleware import token_required, admin_required
from app.validation import json_body, text

access_bp = Blueprint("access", __name__, url_prefix="/api/access")


def _note(data):
    """Optional reviewer note, limited to 500 characters."""
    return text(data.get("note"), 500) or None


@access_bp.route("/request", methods=["POST"])
@token_required
def create_access_request():
    res, status_code = AccessService.create_request(text(json_body().get("doc_id")), request.current_user)
    return jsonify(res), status_code


@access_bp.route("/approve", methods=["POST"])
@token_required
def approve_access_request():
    data = json_body()
    res, status_code = AccessService.approve_request(text(data.get("request_id")), request.current_user, _note(data))
    return jsonify(res), status_code


@access_bp.route("/reject", methods=["POST"])
@token_required
def reject_access_request():
    data = json_body()
    res, status_code = AccessService.reject_request(text(data.get("request_id")), request.current_user, _note(data))
    return jsonify(res), status_code


@access_bp.route("/revoke", methods=["POST"])
@admin_required
def revoke_access_request():
    data = json_body()
    res, status_code = AccessService.revoke_request(text(data.get("request_id")), request.current_user, _note(data))
    return jsonify(res), status_code


@access_bp.route("/inbox", methods=["GET"])
@token_required
def get_division_inbox():
    """Requests other people sent for my division's documents."""
    res, status_code = AccessService.get_division_inbox(request.current_user)
    return jsonify(res), status_code


@access_bp.route("/my-requests", methods=["GET"])
@token_required
def get_sent_requests():
    """Requests I sent to other divisions."""
    res, status_code = AccessService.get_sent_requests(request.current_user)
    return jsonify(res), status_code
