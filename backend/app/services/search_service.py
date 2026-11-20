"""Search across document names, metadata and OCR text.

The search runs inside MongoDB and ignores upper/lower case.

* Names, divisions and metadata can be searched across all divisions, so a
  user can find a document and then ask for access to it. For those results
  we only show the metadata.
* The OCR text (what's written inside the file) is only searched in
  documents the user can already open. So search never leaks what's inside
  another division's documents.
"""
import re
import logging

from app.db import get_db
from app.models.document import DocumentModel
from app.services.doc_service import AccessContext

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
    def build_query(clean_query: str, access: AccessContext) -> dict:
        pattern = {"$regex": re.escape(clean_query), "$options": "i"}

        if access.is_admin:
            ocr_clause = {"ocr_text": pattern}
        else:
            readable_scope = [{"division": access.division}]
            approved = access.approved_object_ids()
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

        # Load the user's access once, then check each result without more queries.
        access = AccessContext(db, current_user)
        query = SearchService.build_query(clean_query, access)
        docs = list(db.documents.find(query).sort("created_at", -1).limit(MAX_RESULTS))

        results = []
        for doc in docs:
            can_download, has_pending = access.check(doc)

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
