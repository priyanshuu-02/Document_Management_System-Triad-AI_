from flask import Blueprint, request, jsonify
from app.services.auth_service import AuthService
from app.middleware.auth_middleware import token_required
from app.models.user import UserModel

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    email = data.get("email", "")
    password = data.get("password", "")
    division = data.get("division", "")
    role = data.get("role", "user")

    res, status_code = AuthService.register(username, email, password, division, role)
    return jsonify(res), status_code

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    identifier = data.get("identifier") or data.get("username") or data.get("email") or ""
    password = data.get("password", "")

    res, status_code = AuthService.login(identifier, password)
    return jsonify(res), status_code

@auth_bp.route("/me", methods=["GET"])
@token_required
def get_me():
    user = getattr(request, "current_user", {})
    return jsonify({"user": UserModel.sanitize(user)}), 200
