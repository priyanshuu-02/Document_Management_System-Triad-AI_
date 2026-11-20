import re
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from bson import ObjectId
from app.db import get_db
from app.models.metadata_field import MetadataFieldModel
from app.models.audit_log import AuditLogModel
from app.models.user import UserModel
from app.middleware.auth_middleware import optional_auth, admin_required
from app.seed import seed_metadata_fields

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def ensure_default_fields():
    """Seed the starter metadata schema the first time it is read."""
    seed_metadata_fields(get_db())

@admin_bp.route("/verify", methods=["GET"])
@admin_required
def verify_admin_access():
    """Verify administrator privileges"""
    return jsonify({"authorized": True, "message": "Admin privileges verified"}), 200

@admin_bp.route("/metadata-fields", methods=["GET"])
@optional_auth
def get_metadata_fields():
    """Read dynamic metadata fields (allowed for all users so filters/upload form work)"""
    ensure_default_fields()
    db = get_db()
    fields = list(db.metadata_fields.find().sort("created_at", 1))
    return jsonify({"fields": [MetadataFieldModel.sanitize(f) for f in fields]}), 200

@admin_bp.route("/metadata-fields", methods=["POST"])
@admin_required
def add_metadata_field():
    """Only administrators can create new dynamic metadata fields"""
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    field_type = data.get("field_type", "text").strip().lower()
    options = data.get("options", [])
    required = bool(data.get("required", False))

    if not name:
        return jsonify({"error": "Field name is required"}), 400

    db = get_db()
    existing = db.metadata_fields.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if existing:
        return jsonify({"error": f"Field '{name}' already exists"}), 409

    doc = MetadataFieldModel.create_field(name=name, field_type=field_type, options=options, required=required)
    result = db.metadata_fields.insert_one(doc)
    doc["_id"] = result.inserted_id

    return jsonify({
        "message": f"Field '{name}' created successfully",
        "field": MetadataFieldModel.sanitize(doc)
    }), 201

@admin_bp.route("/metadata-fields/<field_id>", methods=["PUT"])
@admin_required
def update_metadata_field(field_id):
    """
    Update an existing dynamic metadata field schema.
    This fulfills the requirement that metadata fields can be configured,
    extended, and edited later without hardcoding.
    """
    db = get_db()
    try:
        field_obj_id = ObjectId(field_id)
    except Exception:
        return jsonify({"error": "Invalid field ID"}), 400

    existing = db.metadata_fields.find_one({"_id": field_obj_id})
    if not existing:
        return jsonify({"error": "Field not found"}), 404

    data = request.get_json(silent=True) or {}
    update_doc = {}

    if "name" in data and data["name"].strip():
        new_name = data["name"].strip()
        # Check if the renamed field conflicts with another existing field
        duplicate = db.metadata_fields.find_one({
            "_id": {"$ne": field_obj_id},
            "name": {"$regex": f"^{re.escape(new_name)}$", "$options": "i"}
        })
        if duplicate:
            return jsonify({"error": f"Another field with name '{new_name}' already exists"}), 409
        update_doc["name"] = new_name

    if "field_type" in data and data["field_type"].strip().lower() in ["select", "text", "number"]:
        update_doc["field_type"] = data["field_type"].strip().lower()

    if "options" in data and isinstance(data["options"], list):
        update_doc["options"] = [str(opt).strip() for opt in data["options"] if str(opt).strip()]

    if "required" in data:
        update_doc["required"] = bool(data["required"])

    if not update_doc:
        return jsonify({"error": "No valid fields provided for update"}), 400

    update_doc["updated_at"] = datetime.now(timezone.utc)
    db.metadata_fields.update_one({"_id": field_obj_id}, {"$set": update_doc})

    updated = db.metadata_fields.find_one({"_id": field_obj_id})
    return jsonify({
        "message": "Metadata field updated successfully",
        "field": MetadataFieldModel.sanitize(updated)
    }), 200

@admin_bp.route("/metadata-fields/<field_id>", methods=["DELETE"])
@admin_required
def delete_metadata_field(field_id):
    """Only administrators can delete dynamic metadata fields"""
    db = get_db()
    try:
        res = db.metadata_fields.delete_one({"_id": ObjectId(field_id)})
        if res.deleted_count == 0:
            return jsonify({"error": "Field not found"}), 404
        return jsonify({"message": "Field deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

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
    """
    Admin-only endpoint to promote or update a registered user's role.
    Prevents self-selected admin roles and records an immutable audit event.
    """
    db = get_db()
    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({"error": "Invalid user ID"}), 400

    target_user = db.users.find_one({"_id": user_obj_id})
    if not target_user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    new_role = data.get("role", "admin").strip().lower()
    note = data.get("note", "").strip()

    if new_role not in ["admin", "user"]:
        return jsonify({"error": "Role must be 'admin' or 'user'"}), 400

    actor = getattr(request, "current_user", {})
    actor_id = str(actor.get("_id", actor.get("user_id", "")))

    # Prevent admin from demoting themselves (avoids accidental lockouts)
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

    # Append immutable audit log entry
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
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    identifier = data.get("username") or data.get("email")

    db = get_db()
    target_user = None

    if user_id:
        try:
            target_user = db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            pass
    elif identifier:
        clean = identifier.strip()
        target_user = db.users.find_one({"$or": [{"username": clean}, {"email": clean.lower()}]})

    if not target_user:
        return jsonify({"error": "User to promote not found"}), 404

    # Reuse role update logic
    return update_user_role(str(target_user["_id"]))

@admin_bp.route("/users/<user_id>/division", methods=["POST"])
@admin_required
def update_user_division(user_id):
    """
    Admin-only endpoint to reassign a user's division.
    Allows administrators to transfer users between divisions (e.g. Division A -> Division B)
    as organizational roles change, and logs an immutable audit event.
    """
    db = get_db()
    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({"error": "Invalid user ID"}), 400

    target_user = db.users.find_one({"_id": user_obj_id})
    if not target_user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    new_division = (data.get("division") or "").strip()
    note = (data.get("note") or "").strip()

    if not new_division:
        return jsonify({"error": "Target division is required"}), 400

    old_division = target_user.get("division", "Unknown")
    if old_division == new_division:
        return jsonify({
            "message": f"User is already assigned to '{new_division}'",
            "user": UserModel.sanitize(target_user)
        }), 200

    actor = getattr(request, "current_user", {})
    actor_id = str(actor.get("_id", actor.get("user_id", "")))

    # Update the user's division in the database
    db.users.update_one({"_id": user_obj_id}, {"$set": {"division": new_division}})

    # Record the transfer in the immutable audit trail
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
