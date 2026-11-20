"""First-run setup: default metadata fields and starting accounts.

Safe to run again and again. Existing fields and accounts are never changed
or duplicated. Used by seed_db.py (run when the container starts) and by the
metadata-fields endpoint the first time the field list is read.
"""
import logging

from pymongo.errors import DuplicateKeyError

from app.config import Config
from app.models.metadata_field import MetadataFieldModel
from app.models.user import UserModel

logger = logging.getLogger(__name__)

# "Division" is a normal, editable dropdown field, but it is special: access
# control depends on it, so it always exists and can't be renamed or deleted.
# Admins add or remove divisions by editing its options on the Admin page.
DIVISION_FIELD = "Division"
DEFAULT_DIVISIONS = ["Division A", "Division B", "Division C"]

# Starting fields only. Admins can rename, extend or delete them later on the
# Admin / Settings page; no code depends on these names.
DEFAULT_METADATA_FIELDS = [
    {"name": "Report Type", "field_type": "select",
     "options": ["Financial", "Audit", "Technical", "Operations", "Legal"], "required": False},
    {"name": "Fiscal Year", "field_type": "select",
     "options": ["2024", "2025", "2026", "2027"], "required": False},
    {"name": "Confidentiality", "field_type": "select",
     "options": ["Public", "Internal Only", "Confidential", "Restricted"], "required": False},
]

# Demo accounts for reviewers (only created when SEED_DEMO_USERS=true).
DEMO_PASSWORD = "Password123!"
DEMO_USERS = [
    {"username": "alice", "email": "alice@triad.ai", "division": "Division A"},
    {"username": "bob", "email": "bob@triad.ai", "division": "Division B"},
]


def _find_division_field(db):
    return db.metadata_fields.find_one({"name": {"$regex": f"^{DIVISION_FIELD}$", "$options": "i"}})


def ensure_division_field(db) -> bool:
    """Create the Division field if it is missing. Returns True if it was created."""
    if _find_division_field(db):
        return False
    try:
        db.metadata_fields.insert_one(MetadataFieldModel.create_field(
            name=DIVISION_FIELD, field_type="select", options=DEFAULT_DIVISIONS, required=True))
        return True
    except DuplicateKeyError:
        return False


def get_divisions(db) -> list:
    field = _find_division_field(db)
    return list(field.get("options") or []) if field else list(DEFAULT_DIVISIONS)


def division_allowed(db, division: str) -> bool:
    """Is this one of the divisions the admin has configured?"""
    return division in get_divisions(db)


def seed_metadata_fields(db) -> int:
    """Add the starting fields, but only on a brand-new database.

    Once any field exists we leave the list alone, so a field an admin
    deleted is never quietly brought back. The Division field is the one
    exception: it is always made sure to exist.
    """
    inserted = 0
    if db.metadata_fields.count_documents({}) == 0:
        for field in DEFAULT_METADATA_FIELDS:
            try:
                db.metadata_fields.insert_one(MetadataFieldModel.create_field(**field))
                inserted += 1
            except DuplicateKeyError:
                pass  # another worker added it at the same moment
    if ensure_division_field(db):
        inserted += 1
    return inserted


def _ensure_user(db, username, email, password, division, role) -> bool:
    """Create the account unless the email or username is already taken."""
    if db.users.find_one({"$or": [{"email": email.lower()}, {"username": username}]}):
        return False
    try:
        db.users.insert_one(UserModel.create_user_doc(username, email, password, division, role))
        return True
    except DuplicateKeyError:
        return False


def seed_users(db, config=Config) -> list:
    created = []
    if config.ADMIN_PASSWORD:
        if _ensure_user(db, config.ADMIN_USERNAME, config.ADMIN_EMAIL, config.ADMIN_PASSWORD,
                        config.ADMIN_DIVISION, "admin"):
            created.append(config.ADMIN_EMAIL)
    else:
        logger.info("ADMIN_PASSWORD not set: skipping admin account creation.")

    if config.SEED_DEMO_USERS:
        for user in DEMO_USERS:
            if _ensure_user(db, user["username"], user["email"], DEMO_PASSWORD, user["division"], "user"):
                created.append(user["email"])
    return created


def run_seed(db, config=Config) -> dict:
    fields = seed_metadata_fields(db)
    users = seed_users(db, config)
    logger.info("Seed complete: %d metadata field(s), users created: %s", fields, users or "none")
    return {"metadata_fields_created": fields, "users_created": users}
