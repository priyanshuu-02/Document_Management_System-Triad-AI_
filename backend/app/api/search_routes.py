from flask import Blueprint, request, jsonify
from app.services.search_service import SearchService
from app.middleware.auth_middleware import token_required

search_bp = Blueprint("search", __name__, url_prefix="/api/search")

@search_bp.route("", methods=["GET"])
@token_required
def search_documents():
    query_str = request.args.get("q", "")
    current_user = getattr(request, "current_user", None)

    res, status_code = SearchService.search(query_str, current_user=current_user)
    return jsonify(res), status_code
