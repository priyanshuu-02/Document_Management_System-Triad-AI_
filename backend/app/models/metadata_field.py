from datetime import datetime, timezone

class MetadataFieldModel:
    @staticmethod
    def create_field(name: str, field_type: str = "text", options: list = None, required: bool = False) -> dict:
        return {
            "name": name.strip(),
            "field_type": field_type.strip().lower() if field_type else "text",
            "options": [opt.strip() for opt in options if opt.strip()] if options else [],
            "required": bool(required),
            "created_at": datetime.now(timezone.utc)
        }

    @staticmethod
    def sanitize(field: dict) -> dict:
        if not field:
            return {}
        return {
            "id": str(field.get("_id")),
            "name": field.get("name", ""),
            "field_type": field.get("field_type", "text"),
            "options": field.get("options", []),
            "required": field.get("required", False),
            "created_at": field.get("created_at").isoformat() if isinstance(field.get("created_at"), datetime) else None
        }
