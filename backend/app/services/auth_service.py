import logging
from app.db import get_db
from app.models.user import UserModel
from app.middleware.auth_middleware import generate_token

logger = logging.getLogger(__name__)

class AuthService:
    @staticmethod
    def register(username: str, email: str, password: str, division: str, role: str = "user"):
        if not username or not email or not password or not division:
            return {"error": "Username, email, password, and division are required"}, 400

        db = get_db()
        email_clean = email.strip().lower()
        username_clean = username.strip()

        # Check existing user
        if db.users.find_one({"$or": [{"email": email_clean}, {"username": username_clean}]}):
            return {"error": "User with this username or email already exists"}, 409

        # Public registration can never mint an administrator account. Admins
        # are provisioned through trusted initialization/operations tooling.
        user_doc = UserModel.create_user_doc(username_clean, email_clean, password, division, "user")
        result = db.users.insert_one(user_doc)
        user_doc["_id"] = result.inserted_id

        token = generate_token(
            user_id=str(result.inserted_id),
            username=user_doc["username"],
            division=user_doc["division"],
            role=user_doc["role"]
        )

        return {
            "message": "User registered successfully",
            "token": token,
            "user": UserModel.sanitize(user_doc)
        }, 201

    @staticmethod
    def login(identifier: str, password: str):
        if not identifier or not password:
            return {"error": "Identifier (username or email) and password are required"}, 400

        db = get_db()
        clean_id = identifier.strip()
        user = db.users.find_one({
            "$or": [
                {"email": clean_id.lower()},
                {"username": clean_id}
            ]
        })

        if not user or not UserModel.check_password(password, user.get("password_hash", "")):
            return {"error": "Invalid username/email or password"}, 401

        token = generate_token(
            user_id=str(user["_id"]),
            username=user["username"],
            division=user["division"],
            role=user.get("role", "user")
        )

        return {
            "message": "Login successful",
            "token": token,
            "user": UserModel.sanitize(user)
        }, 200
