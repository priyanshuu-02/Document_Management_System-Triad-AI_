"""Sign-up, login and "who am I" endpoints."""
from flask import Blueprint, request, jsonify
from app.services.auth_service import AuthService
from app.middleware.auth_middleware import token_required
from app.models.user import UserModel
from app.validation import json_body

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = json_body()
    res, status_code = AuthService.register(
        data.get("username"), data.get("email"), data.get("password"), data.get("division")
    )
    return jsonify(res), status_code


@auth_bp.route("/login", methods=["POST"])
def login():
    data = json_body()
    # The user can type either their email or their username.
    identifier = data.get("identifier") or data.get("username") or data.get("email")
    res, status_code = AuthService.login(identifier, data.get("password"))
    return jsonify(res), status_code


@auth_bp.route("/me", methods=["GET"])
@token_required
def get_me():
    return jsonify({"user": UserModel.sanitize(request.current_user)}), 200
