"""Search endpoint: GET /api/search?q=<words>"""
from flask import Blueprint, request, jsonify
from app.services.search_service import SearchService
from app.middleware.auth_middleware import token_required

search_bp = Blueprint("search", __name__, url_prefix="/api/search")

# Long search text is cut off; nobody needs more and it keeps queries cheap.
MAX_QUERY_LENGTH = 200


@search_bp.route("", methods=["GET"])
@token_required
def search_documents():
    query_str = request.args.get("q", "")[:MAX_QUERY_LENGTH]
    res, status_code = SearchService.search(query_str, current_user=request.current_user)
    return jsonify(res), status_code
