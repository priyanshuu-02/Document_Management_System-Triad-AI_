"""Sign-up and login."""
import logging
from pymongo.errors import DuplicateKeyError
from app.db import get_db
from app.models.user import UserModel
from app.middleware.auth_middleware import generate_token
from app.validation import text, EMAIL_RE
from app.seed import seed_metadata_fields, division_allowed

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8
# bcrypt only looks at the first 72 bytes of a password.
MAX_PASSWORD_LENGTH = 72


def _token_response(message, user_doc, status):
    token = generate_token(
        user_id=str(user_doc["_id"]),
        username=user_doc["username"],
        division=user_doc["division"],
        role=user_doc.get("role", "user"),
    )
    return {"message": message, "token": token, "user": UserModel.sanitize(user_doc)}, status


class AuthService:
    @staticmethod
    def register(username, email, password, division, role="user"):
        # text() turns anything that isn't a string into "", so a JSON object
        # like {"$ne": ""} can never reach a database query.
        username = text(username, 50)
        email = text(email, 254).lower()
        division = text(division, 100)
        password = password if isinstance(password, str) else ""

        if not username or not email or not password or not division:
            return {"error": "Username, email, password, and division are required"}, 400
        if not EMAIL_RE.match(email):
            return {"error": "Please enter a valid email address"}, 400
        if len(password) < MIN_PASSWORD_LENGTH:
            return {"error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters"}, 400
        if len(password.encode("utf-8")) > MAX_PASSWORD_LENGTH:
            return {"error": f"Password must be at most {MAX_PASSWORD_LENGTH} characters"}, 400

        db = get_db()
        # The division must be one the admin has set up (Admin page > Division field).
        seed_metadata_fields(db)
        if not division_allowed(db, division):
            return {"error": f"'{division}' is not a valid division"}, 400
        if db.users.find_one({"$or": [{"email": email}, {"username": username}]}):
            return {"error": "User with this username or email already exists"}, 409

        # Sign-up always creates a normal user, whatever "role" was sent.
        # Admins are only created by the seed script or promoted by another admin.
        user_doc = UserModel.create_user_doc(username, email, password, division, "user")
        try:
            user_doc["_id"] = db.users.insert_one(user_doc).inserted_id
        except DuplicateKeyError:  # two sign-ups with the same name at once
            return {"error": "User with this username or email already exists"}, 409
        return _token_response("User registered successfully", user_doc, 201)

    @staticmethod
    def login(identifier, password):
        identifier = text(identifier, 254)
        password = password if isinstance(password, str) else ""
        if not identifier or not password:
            return {"error": "Identifier (username or email) and password are required"}, 400

        # Log in with either the email or the username.
        user = get_db().users.find_one({"$or": [{"email": identifier.lower()}, {"username": identifier}]})

        # Same message for "no such user" and "wrong password", so nobody can
        # find out which accounts exist.
        if not user or not UserModel.check_password(password, user.get("password_hash", "")):
            return {"error": "Invalid username/email or password"}, 401
        return _token_response("Login successful", user, 200)
