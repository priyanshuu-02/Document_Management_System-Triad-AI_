"""Admin endpoints: metadata fields, users, roles, divisions and the audit log.

Everything here needs an admin login, except reading the metadata field list,
which the sign-up page, upload form and filters all use.
"""
import re
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from bson import ObjectId
from bson.errors import InvalidId
from app.db import get_db
from app.models.metadata_field import MetadataFieldModel
from app.models.audit_log import AuditLogModel
from app.models.user import UserModel
from app.middleware.auth_middleware import optional_auth, admin_required
from app.seed import seed_metadata_fields, division_allowed, DIVISION_FIELD
from app.validation import json_body, text, is_safe_key

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

FIELD_TYPES = ("select", "text", "number")
MAX_OPTIONS = 100


def _object_id(value):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def _clean_options(options):
    """Keep only non-empty text options, without duplicates."""
    cleaned = []
    for opt in options if isinstance(options, list) else []:
        opt = str(opt).strip()[:100] if isinstance(opt, (str, int, float)) else ""
        if opt and opt not in cleaned:
            cleaned.append(opt)
    return cleaned[:MAX_OPTIONS]


def _name_taken(db, name, except_id=None):
    """Is another field already using this name? (ignoring upper/lower case)"""
    query = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if except_id:
        query["_id"] = {"$ne": except_id}
    return db.metadata_fields.find_one(query) is not None


def _is_division_field(field):
    return (field.get("name") or "").lower() == DIVISION_FIELD.lower()


@admin_bp.route("/verify", methods=["GET"])
@admin_required
def verify_admin_access():
    return jsonify({"authorized": True, "message": "Admin privileges verified"}), 200


@admin_bp.route("/metadata-fields", methods=["GET"])
@optional_auth
def get_metadata_fields():
    """List the metadata fields. Open to everyone, because the sign-up page
    needs the division list and the upload form and filters need the fields."""
    db = get_db()
    seed_metadata_fields(db)
    fields = list(db.metadata_fields.find().sort("created_at", 1))
    return jsonify({"fields": [MetadataFieldModel.sanitize(f) for f in fields]}), 200


@admin_bp.route("/metadata-fields", methods=["POST"])
@admin_required
def add_metadata_field():
    data = json_body()
    name = text(data.get("name"), 100)
    field_type = text(data.get("field_type")).lower() or "text"
    options = _clean_options(data.get("options"))

    if not name or not is_safe_key(name):
        return jsonify({"error": "Field name is required and can't start with '$' or contain '.'"}), 400
    if field_type not in FIELD_TYPES:
        return jsonify({"error": f"Field type must be one of: {', '.join(FIELD_TYPES)}"}), 400
    if field_type == "select" and not options:
        return jsonify({"error": "A dropdown field needs at least one option"}), 400

    db = get_db()
    if _name_taken(db, name):
        return jsonify({"error": f"Field '{name}' already exists"}), 409

    doc = MetadataFieldModel.create_field(name=name, field_type=field_type, options=options,
                                          required=bool(data.get("required", False)))
    doc["_id"] = db.metadata_fields.insert_one(doc).inserted_id
    return jsonify({"message": f"Field '{name}' created successfully", "field": MetadataFieldModel.sanitize(doc)}), 201


@admin_bp.route("/metadata-fields/<field_id>", methods=["PUT"])
@admin_required
def update_metadata_field(field_id):
    """Edit a field: rename it, change its type, or add/remove options
    (for example adding a new Report Type)."""
    field_obj_id = _object_id(field_id)
    if not field_obj_id:
        return jsonify({"error": "Invalid field ID"}), 400

    db = get_db()
    existing = db.metadata_fields.find_one({"_id": field_obj_id})
    if not existing:
        return jsonify({"error": "Field not found"}), 404

    data = json_body()
    update_doc = {}
    division_field = _is_division_field(existing)

    new_name = text(data.get("name"), 100)
    if new_name and new_name != existing.get("name"):
        if division_field:
            # Access control is built on the "Division" field, so it keeps its name.
            return jsonify({"error": "The Division field can't be renamed"}), 400
        if not is_safe_key(new_name):
            return jsonify({"error": "Field name can't start with '$' or contain '.'"}), 400
        if _name_taken(db, new_name, except_id=field_obj_id):
            return jsonify({"error": f"Another field with name '{new_name}' already exists"}), 409
        update_doc["name"] = new_name

    field_type = text(data.get("field_type")).lower()
    if field_type in FIELD_TYPES and not division_field:
        update_doc["field_type"] = field_type

    if "options" in data:
        options = _clean_options(data.get("options"))
        if division_field and not options:
            return jsonify({"error": "There must be at least one division"}), 400
        update_doc["options"] = options

    if "required" in data and not division_field:
        update_doc["required"] = bool(data["required"])

    if not update_doc:
        return jsonify({"error": "No valid fields provided for update"}), 400

    update_doc["updated_at"] = datetime.now(timezone.utc)
    db.metadata_fields.update_one({"_id": field_obj_id}, {"$set": update_doc})
    updated = db.metadata_fields.find_one({"_id": field_obj_id})
    return jsonify({"message": "Metadata field updated successfully", "field": MetadataFieldModel.sanitize(updated)}), 200


@admin_bp.route("/metadata-fields/<field_id>", methods=["DELETE"])
@admin_required
def delete_metadata_field(field_id):
    field_obj_id = _object_id(field_id)
    if not field_obj_id:
        return jsonify({"error": "Invalid field ID"}), 400
    db = get_db()
    field = db.metadata_fields.find_one({"_id": field_obj_id})
    if not field:
        return jsonify({"error": "Field not found"}), 404
    if _is_division_field(field):
        return jsonify({"error": "The Division field is needed for access control and can't be deleted"}), 400
    db.metadata_fields.delete_one({"_id": field_obj_id})
    return jsonify({"message": "Field deleted successfully"}), 200

@admin_bp.route("/audit-events", methods=["GET"])
@admin_required
def get_audit_events():
    """Read-only, newest-first access-control audit trail for administrators with filtering."""
    db = get_db()
    try:
        limit = min(max(int(request.args.get("limit", 250)), 1), 1000)
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    query = {}
    event_type = request.args.get("event_type")
    if event_type and event_type != "all":
        query["event_type"] = event_type

    actor = request.args.get("actor")
    if actor and actor != "all":
        query["actor_username"] = {"$regex": re.escape(actor), "$options": "i"}

    subject = request.args.get("subject")
    if subject:
        query["subject_username"] = {"$regex": re.escape(subject), "$options": "i"}

    search = request.args.get("q")
    if search:
        s_regex = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [
            {"actor_username": s_regex},
            {"subject_username": s_regex},
            {"doc_filename": s_regex},
            {"note": s_regex},
            {"event_type": s_regex},
        ]

    events = list(db.audit_events.find(query).sort("created_at", -1).limit(limit))
    return jsonify({"events": [AuditLogModel.sanitize(event) for event in events], "total": len(events)}), 200

@admin_bp.route("/users", methods=["GET"])
@admin_required
def list_users():
    """List all registered users for administrative management."""
    db = get_db()
    users = list(db.users.find().sort("created_at", -1))
    return jsonify({
        "users": [UserModel.sanitize(u) for u in users],
        "total": len(users)
    }), 200

@admin_bp.route("/users/<user_id>/role", methods=["POST"])
@admin_required
def update_user_role(user_id):
    """Make a user an admin, or change an admin back to a normal user."""
    db = get_db()
    user_obj_id = _object_id(user_id)
    if not user_obj_id:
        return jsonify({"error": "Invalid user ID"}), 400

    target_user = db.users.find_one({"_id": user_obj_id})
    if not target_user:
        return jsonify({"error": "User not found"}), 404

    data = json_body()
    new_role = (text(data.get("role")) or "admin").lower()
    note = text(data.get("note"), 500)

    if new_role not in ["admin", "user"]:
        return jsonify({"error": "Role must be 'admin' or 'user'"}), 400

    actor = getattr(request, "current_user", {})
    actor_id = str(actor.get("_id", actor.get("user_id", "")))

    # An admin can't demote themselves, so the system is never left without one by accident.
    if actor_id == str(target_user["_id"]) and new_role != "admin":
        return jsonify({"error": "Administrators cannot demote their own account"}), 400

    old_role = target_user.get("role", "user")
    if old_role == new_role:
        return jsonify({
            "message": f"User is already assigned the '{new_role}' role",
            "user": UserModel.sanitize(target_user)
        }), 200

    # Update role
    db.users.update_one({"_id": user_obj_id}, {"$set": {"role": new_role}})

    # Record the change in the audit log
    audit_event = {
        "event_type": "user_role_updated",
        "subject_user_id": str(target_user["_id"]),
        "subject_username": target_user.get("username", ""),
        "subject_email": target_user.get("email", ""),
        "doc_division": target_user.get("division", ""),
        "old_role": old_role,
        "new_role": new_role,
        "actor_id": actor_id,
        "actor_username": actor.get("username", "Admin"),
        "note": note or f"User role changed from '{old_role}' to '{new_role}' by {actor.get('username')}",
        "created_at": datetime.now(timezone.utc),
    }
    db.audit_events.insert_one(audit_event)

    updated_user = db.users.find_one({"_id": user_obj_id})
    action_str = "promoted to administrator" if new_role == "admin" else "updated to standard user"
    return jsonify({
        "message": f"User '{target_user.get('username')}' has been {action_str} successfully",
        "user": UserModel.sanitize(updated_user)
    }), 200

@admin_bp.route("/users/promote", methods=["POST"])
@admin_required
def promote_user_shortcut():
    """Shortcut endpoint to promote a user to admin by user_id, username, or email."""
    data = json_body()
    user_id = text(data.get("user_id"))
    identifier = text(data.get("username")) or text(data.get("email"))

    db = get_db()
    target_user = None

    if user_id and _object_id(user_id):
        target_user = db.users.find_one({"_id": _object_id(user_id)})
    elif identifier:
        target_user = db.users.find_one({"$or": [{"username": identifier}, {"email": identifier.lower()}]})

    if not target_user:
        return jsonify({"error": "User to promote not found"}), 404

    # Reuse role update logic
    return update_user_role(str(target_user["_id"]))

@admin_bp.route("/users/<user_id>/division", methods=["POST"])
@admin_required
def update_user_division(user_id):
    """Move a user to another division (for example from Division A to Division B)."""
    db = get_db()
    user_obj_id = _object_id(user_id)
    if not user_obj_id:
        return jsonify({"error": "Invalid user ID"}), 400

    target_user = db.users.find_one({"_id": user_obj_id})
    if not target_user:
        return jsonify({"error": "User not found"}), 404

    data = json_body()
    new_division = text(data.get("division"), 100)
    note = text(data.get("note"), 500)

    if not new_division:
        return jsonify({"error": "Target division is required"}), 400
    if not division_allowed(db, new_division):
        return jsonify({"error": f"'{new_division}' is not one of the configured divisions"}), 400

    old_division = target_user.get("division", "Unknown")
    if old_division == new_division:
        return jsonify({
            "message": f"User is already assigned to '{new_division}'",
            "user": UserModel.sanitize(target_user)
        }), 200

    actor = getattr(request, "current_user", {})
    actor_id = str(actor.get("_id", actor.get("user_id", "")))

    db.users.update_one({"_id": user_obj_id}, {"$set": {"division": new_division}})

    # Record the move in the audit log
    audit_event = {
        "event_type": "user_division_updated",
        "subject_user_id": str(target_user["_id"]),
        "subject_username": target_user.get("username", ""),
        "subject_email": target_user.get("email", ""),
        "old_division": old_division,
        "new_division": new_division,
        "actor_id": actor_id,
        "actor_username": actor.get("username", "Admin"),
        "note": note or f"User division transferred from '{old_division}' to '{new_division}' by {actor.get('username')}",
        "created_at": datetime.now(timezone.utc),
    }
    db.audit_events.insert_one(audit_event)

    updated_user = db.users.find_one({"_id": user_obj_id})
    return jsonify({
        "message": f"User '{target_user.get('username')}' division updated from '{old_division}' to '{new_division}'",
        "user": UserModel.sanitize(updated_user)
    }), 200
