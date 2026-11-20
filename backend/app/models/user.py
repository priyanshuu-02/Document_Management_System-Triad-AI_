"""How a user is stored, and password hashing (bcrypt, so we never keep the real password)."""
from datetime import datetime, timezone
import bcrypt

class UserModel:
    @staticmethod
    def hash_password(password: str) -> str:
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def check_password(password: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

    @staticmethod
    def create_user_doc(username: str, email: str, password: str, division: str, role: str = "user") -> dict:
        return {
            "username": username.strip(),
            "email": email.strip().lower(),
            "password_hash": UserModel.hash_password(password),
            "division": division.strip(),
            "role": role.strip().lower() if role else "user",
            "created_at": datetime.now(timezone.utc)
        }

    @staticmethod
    def sanitize(user_doc: dict) -> dict:
        if not user_doc:
            return {}
        return {
            "id": str(user_doc.get("_id")),
            "username": user_doc.get("username", ""),
            "email": user_doc.get("email", ""),
            "division": user_doc.get("division", ""),
            "role": user_doc.get("role", "user"),
            "created_at": user_doc.get("created_at").isoformat() if isinstance(user_doc.get("created_at"), datetime) else None
        }
