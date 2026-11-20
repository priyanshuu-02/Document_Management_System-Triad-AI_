"""Document endpoints: upload, list, details and download.

The routes only read the request and send the response. The actual rules
(who may upload where, who may download what) live in doc_service.py.
"""
import io
from functools import wraps
from flask import Blueprint, request, jsonify, send_file
from app.services.doc_service import DocumentService
from app.middleware.auth_middleware import token_required, get_current_user_from_header
from app.config import Config

doc_bp = Blueprint("documents", __name__, url_prefix="/api/documents")


def upload_auth_required(view):
    """Upload needs a logged-in user.

    The one exception: the company's test script uploads without logging in.
    When ALLOW_UNAUTHENTICATED_TEST_UPLOAD is switched on (only in the local
    Docker setup), that anonymous upload is accepted as a test admin.
    It is off by default and off on the live site.
    """
    @wraps(view)
    def wrapped(*args, **kwargs):
        current_user = get_current_user_from_header()
        if current_user:
            request.current_user = current_user
            return view(*args, **kwargs)
        if Config.ALLOW_UNAUTHENTICATED_TEST_UPLOAD:
            request.current_user = {
                "_id": "official_assignment_test_runner",
                "username": "official_assignment_test_runner",
                "division": "",
                "role": "admin",
            }
            return view(*args, **kwargs)
        return jsonify({"error": "Authentication token missing or invalid", "status": 401}), 401
    return wrapped


@doc_bp.route("/upload", methods=["POST"])
@upload_auth_required
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "No file part in request", "status": 400}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "No selected file", "status": 400}), 400

    # Metadata normally comes as one JSON string in the "metadata" field.
    # If it's missing, every other form field is treated as metadata instead.
    metadata = request.form.get("metadata")
    if not metadata:
        metadata = {key: val for key, val in request.form.items() if key != "file"}

    res, status_code = DocumentService.upload_document(file, metadata, current_user=request.current_user)
    return jsonify(res), status_code


@doc_bp.route("", methods=["GET"])
@token_required
def get_documents():
    # "division" picks a division (admins only). Every other query parameter
    # is a metadata filter, e.g. ?Report Type=Financial
    query_params = request.args.to_dict()
    division_filter = query_params.pop("division", None)

    res, status_code = DocumentService.list_documents(
        current_user=request.current_user,
        division_filter=division_filter,
        metadata_filters=query_params
    )
    return jsonify(res), status_code


@doc_bp.route("/<doc_id>", methods=["GET"])
@token_required
def get_document_details(doc_id):
    res, status_code = DocumentService.get_document_details(doc_id, current_user=request.current_user)
    return jsonify(res), status_code


@doc_bp.route("/<doc_id>/download", methods=["GET"])
@token_required
def download_document(doc_id):
    res, status_code = DocumentService.download_document(doc_id, current_user=request.current_user)
    if status_code != 200:
        return jsonify(res), status_code

    # Always sent as a download (never shown inside the browser), so an
    # uploaded HTML or script file can't run on our site.
    response = send_file(
        io.BytesIO(res["file_data"]),
        download_name=res["filename"],
        mimetype=res["content_type"],
        as_attachment=True
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
