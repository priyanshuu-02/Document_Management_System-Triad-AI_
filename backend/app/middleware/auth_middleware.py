"""Login tokens (JWT) and the decorators that protect the API routes.

After login the user gets a signed token. Every protected request sends it in
the "Authorization: Bearer <token>" header. We check the signature, then load
the user fresh from the database, so a role or division change (or a deleted
account) takes effect straight away instead of waiting for the token to expire.
"""
from functools import wraps
from datetime import datetime, timezone, timedelta
import jwt
from flask import request, jsonify
from bson import ObjectId
from bson.errors import InvalidId
from app.config import Config
from app.db import get_db


def generate_token(user_id: str, username: str, division: str, role: str = "user") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": str(user_id),
        "username": username,
        "division": division,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_token(token: str):
    """Return the token's contents, or None if it is fake, broken or expired."""
    try:
        # Only HS256 is accepted, so a token can't pick a weaker algorithm.
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None


def get_current_user_from_header():
    """Find the logged-in user from the request, or return None."""
    auth_header = request.headers.get("Authorization", "")
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
    elif len(parts) == 1:
        token = parts[0]
    else:
        return None

    decoded = decode_token(token)
    if not decoded or not decoded.get("user_id"):
        return None

    # The account must still exist. A token for a deleted user is rejected.
    try:
        return get_db().users.find_one({"_id": ObjectId(decoded["user_id"])})
    except (InvalidId, TypeError):
        return None


def token_required(f):
    """Route needs a logged-in user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_header()
        if not user:
            return jsonify({"error": "Authentication token missing or invalid", "status": 401}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated


def optional_auth(f):
    """Route works for everyone; request.current_user is None if not logged in."""
    @wraps(f)
    def decorated(*args, **kwargs):
        request.current_user = get_current_user_from_header()
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Route needs a logged-in admin."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_header()
        if not user:
            return jsonify({"error": "Authentication required", "status": 401}), 401
        if user.get("role") != "admin":
            return jsonify({"error": "Admin privilege required", "status": 403}), 403
        request.current_user = user
        return f(*args, **kwargs)
    return decorated
