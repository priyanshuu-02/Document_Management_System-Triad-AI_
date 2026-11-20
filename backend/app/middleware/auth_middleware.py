from functools import wraps
from datetime import datetime, timezone, timedelta
import jwt
from flask import request, jsonify
from bson import ObjectId
from app.config import Config
from app.db import get_db

def generate_token(user_id: str, username: str, division: str, role: str = "user") -> str:
    payload = {
        "user_id": str(user_id),
        "username": username,
        "division": division,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def get_current_user_from_header():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return None
    
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
    else:
        token = auth_header

    decoded = decode_token(token)
    if not decoded:
        return None

    db = get_db()
    try:
        user = db.users.find_one({"_id": ObjectId(decoded["user_id"])})
        if user:
            return user
    except Exception:
        pass

    # If ObjectId lookup fails, return the decoded payload directly
    return {
        "_id": decoded.get("user_id"),
        "username": decoded.get("username"),
        "division": decoded.get("division"),
        "role": decoded.get("role", "user")
    }

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_header()
        if not user:
            return jsonify({"error": "Authentication token missing or invalid", "status": 401}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

def optional_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_header()
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
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
