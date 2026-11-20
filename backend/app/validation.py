"""Small helpers for checking data that comes from users.

Everything a client sends (JSON bodies, form fields, query strings) is
untrusted. These helpers make sure we only ever work with plain strings and
simple values, so nobody can slip a MongoDB operator like {"$ne": ""} into a
query or crash the server with an unexpected type.
"""
import os
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MAX_METADATA_FIELDS = 50
MAX_METADATA_KEY = 100
MAX_METADATA_VALUE = 500
MAX_FILENAME = 255


def text(value, max_length=None) -> str:
    """Return the value as a trimmed string, or "" if it is not a string."""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    return value[:max_length] if max_length else value


def is_safe_key(key) -> bool:
    """A metadata key must be a normal name: no "$" at the start and no dots,
    because MongoDB treats those as operators and nested paths."""
    return (
        isinstance(key, str)
        and 0 < len(key.strip()) <= MAX_METADATA_KEY
        and not key.strip().startswith("$")
        and "." not in key
    )


def json_body() -> dict:
    """The request's JSON body as a dict ({} if it is missing or not an object)."""
    from flask import request
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def clean_metadata(raw):
    """Check uploaded metadata and return (metadata, error_message).

    Metadata must be a flat object of name -> simple value. Values are stored
    as text so filtering and search behave the same for every field.
    """
    if raw is None:
        return {}, None
    if not isinstance(raw, dict):
        return None, "Metadata must be a JSON object"
    if len(raw) > MAX_METADATA_FIELDS:
        return None, f"Too many metadata fields (max {MAX_METADATA_FIELDS})"

    cleaned = {}
    for key, value in raw.items():
        if not is_safe_key(key):
            return None, f"Invalid metadata field name: {str(key)[:50]!r}"
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (str, int, float)):
            return None, f"Metadata field '{key.strip()}' must be text or a number"
        value = str(value).strip()
        if len(value) > MAX_METADATA_VALUE:
            return None, f"Metadata field '{key.strip()}' is too long"
        cleaned[key.strip()] = value
    return cleaned, None


def clean_filename(name) -> str:
    """Keep only the file's own name (drop any folder path the browser sent)."""
    name = text(name).replace("\\", "/")
    name = os.path.basename(name)
    return name[:MAX_FILENAME] or "unnamed_file"
