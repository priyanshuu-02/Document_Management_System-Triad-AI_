"""Idempotent database seeding: starter metadata schema and initial accounts.

Used by ``seed_db.py`` (run by the container entrypoint before the web server
starts) and by the metadata-fields endpoint for a first-time empty schema.
"""
import logging

from pymongo.errors import DuplicateKeyError

from app.config import Config
from app.models.metadata_field import MetadataFieldModel
from app.models.user import UserModel

logger = logging.getLogger(__name__)

# Starter schema only.  Admins can rename, extend or delete these from the
# Admin / Settings page; nothing in the code depends on these names.
DEFAULT_METADATA_FIELDS = [
    {"name": "Report Type", "field_type": "select",
     "options": ["Financial", "Audit", "Technical", "Operations", "Legal"], "required": False},
    {"name": "Fiscal Year", "field_type": "select",
     "options": ["2024", "2025", "2026", "2027"], "required": False},
    {"name": "Confidentiality", "field_type": "select",
     "options": ["Public", "Internal Only", "Confidential", "Restricted"], "required": False},
]

# Local / review demo accounts (enabled with SEED_DEMO_USERS=true).
DEMO_PASSWORD = "Password123!"
DEMO_USERS = [
    {"username": "alice", "email": "alice@triad.ai", "division": "Division A"},
    {"username": "bob", "email": "bob@triad.ai", "division": "Division B"},
]


def seed_metadata_fields(db) -> int:
    """Insert the starter fields only when no schema exists yet.

    Seeding is skipped once any field exists so fields an admin deleted are
    never re-created behind their back.
    """
    if db.metadata_fields.count_documents({}) > 0:
        return 0
    inserted = 0
    for field in DEFAULT_METADATA_FIELDS:
        try:
            db.metadata_fields.insert_one(MetadataFieldModel.create_field(**field))
            inserted += 1
        except DuplicateKeyError:
            pass  # another worker seeded it concurrently
    return inserted


def _ensure_user(db, username, email, password, division, role) -> bool:
    """Create the account if neither its email nor username exists. Returns True if created."""
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
