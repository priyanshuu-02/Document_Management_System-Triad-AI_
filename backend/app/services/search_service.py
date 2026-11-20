"""Search across document titles, dynamic metadata and OCR-extracted text.

Matching runs inside MongoDB (case-insensitive substring match):

* filename, division and metadata (via the denormalised ``metadata_text``)
  are searchable across all divisions, so a user can discover a document and
  request access to it.  Only metadata is exposed for such results.
* OCR text is matched only within documents the user may already read
  (their own division, approved requests, or any document for admins), so a
  search can never reveal confidential content from another division.
"""
import re
import logging

from app.db import get_db
from app.models.document import DocumentModel
from app.services.doc_service import check_access, approved_doc_ids

logger = logging.getLogger(__name__)

MAX_RESULTS = 100
SNIPPET_RADIUS = 40


def _snippet(text: str, needle: str) -> str:
    idx = text.lower().find(needle)
    if idx < 0:
        return ""
    start = max(0, idx - SNIPPET_RADIUS)
    end = min(len(text), idx + len(needle) + SNIPPET_RADIUS)
    return ("..." if start > 0 else "") + text[start:end].replace("\n", " ") + ("..." if end < len(text) else "")


class SearchService:
    @staticmethod
    def build_query(clean_query: str, current_user: dict, db) -> dict:
        pattern = {"$regex": re.escape(clean_query), "$options": "i"}

        if current_user and current_user.get("role") == "admin":
            ocr_clause = {"ocr_text": pattern}
        else:
            readable_scope = [{"division": (current_user or {}).get("division")}]
            approved = approved_doc_ids(db, current_user)
            if approved:
                readable_scope.append({"_id": {"$in": approved}})
            ocr_clause = {"$and": [{"ocr_text": pattern}, {"$or": readable_scope}]}

        return {"$or": [
            {"filename": pattern},
            {"division": pattern},
            {"metadata_text": pattern},
            ocr_clause,
        ]}

    @staticmethod
    def search(query_str: str, current_user: dict = None):
        if not query_str or not query_str.strip():
            return {"results": [], "total": 0, "query": ""}, 200

        clean_query = query_str.strip()
        lower_q = clean_query.lower()
        db = get_db()
        user_division = current_user.get("division") if current_user else None

        query = SearchService.build_query(clean_query, current_user, db)
        docs = list(db.documents.find(query).sort("created_at", -1).limit(MAX_RESULTS))

        results = []
        for doc in docs:
            can_download, has_pending = check_access(db, doc, current_user)

            # Report which fields matched so the UI can explain each result.
            matched_in = []
            if lower_q in (doc.get("filename") or "").lower():
                matched_in.append("filename")
            if lower_q in (doc.get("division") or "").lower():
                matched_in.append("division")
            for key, value in (doc.get("metadata") or {}).items():
                if lower_q in str(key).lower() or lower_q in str(value).lower():
                    matched_in.append(f"metadata:{key}")
            ocr = doc.get("ocr_text") or ""
            if can_download and lower_q in ocr.lower():
                matched_in.append("ocr_text")

            if not matched_in:
                continue

            item = DocumentModel.sanitize(
                doc,
                current_user_division=user_division,
                has_approved_access=can_download,
                has_pending_request=has_pending,
            )
            item["matched_fields"] = matched_in
            item["snippet"] = _snippet(ocr, lower_q) if "ocr_text" in matched_in else ""
            results.append(item)

        return {"results": results, "total": len(results), "query": clean_query}, 200
