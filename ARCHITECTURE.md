# Architecture

## Overview

```
Browser
   │  HTTPS
   ▼
nginx (frontend container)
   ├─ serves the React single-page app
   └─ /api/*  ──proxy──►  Flask API (gunicorn, backend container)
                             ├─ auth: JWT (HS256) + bcrypt
                             ├─ documents: upload, list, details, download
                             ├─ access: request / approve / reject / revoke
                             ├─ search
                             ├─ admin: metadata fields, users, audit log
                             └─ OCR: PDF text layer → Tesseract → LLMWhisperer (optional)
                                   │
                                   ▼
                             MongoDB: collections + GridFS (fs.files / fs.chunks)
```

The API code is split into three layers:
- **Routes** (`app/api`) parse requests.
- **Services** (`app/services`) hold the rules.
- **Models** (`app/models`) define the shape of stored documents.

## Data model

| Collection | Key fields | Notes |
| :--- | :--- | :--- |
| `users` | `username`, `email`, `password_hash`, `division`, `role` (`user` or `admin`) | Unique email and username |
| `metadata_fields` | `name`, `field_type` (`select`, `text`, `number`), `options`, `required` | The configurable schema used by upload forms and filters |
| `documents` | `filename`, `content_type`, `file_size`, `division`, `metadata` (object), `metadata_text`, `ocr_text`, `gridfs_id`, `uploaded_by`, `created_at` | `metadata_text` is a flattened copy of `metadata` used by search |
| `access_requests` | `doc_id`, `doc_division`, `requested_by_id`, `requester_division`, `status`, reviewer and revocation fields | Status: `pending`, `approved`, `rejected` or `revoked` |
| `audit_events` | `event_type`, actor, subject, document, `note`, `created_at` | Insert-only; the API never updates or deletes them |
| `fs.files`, `fs.chunks` | GridFS | The uploaded file bytes |

Indexes are created at start-up (`app/db.py`): division + date on documents, document + user + status on access requests, division + status for the inbox, and unique keys on users and field names.

### Dynamic metadata

Field definitions are data, not code. The upload form and dashboard filters read `metadata_fields`, and documents store whatever keys were submitted. List filtering maps any query parameter to `metadata.<key>`, e.g. `?Report Type=Financial`. Adding or renaming a field needs no code change or migration.

## Access control

The rules live in `check_access()` in `app/services/doc_service.py`:

1. **Admin:** can open any document.
2. **Same division:** can open the document.
3. **Approved request:** can open that one document.
4. **Anyone else:** gets metadata only. OCR text is removed from responses and downloads return 403.

Other rules:
- The authenticated user is loaded from the database on every request, so role and division changes take effect immediately.
- Uploads are forced to the uploader's division; an upload targeting another division gets 403.
- Public registration always creates a `user`; admins are seeded or promoted by an admin.

### Access request lifecycle

```
request ──► pending ──approve──► approved ──revoke (admin)──► revoked
                    └─reject───► rejected
```

- Only members or admins of the document's division can approve or reject a request.
- A user can request access again after a rejection or revocation, and an older request never hides a newer approval.
- Every transition writes an `audit_events` record.

## OCR pipeline

Implemented in `app/services/ocr_service.py`. Each step runs only if the previous one found no usable text:

1. **Embedded text:** digital PDFs are read with pypdf, with pdfplumber as a fallback. This step is fast and exact.
2. **Tesseract:** handles images (PNG, JPEG, TIFF, BMP, GIF, WebP) and PDFs without a text layer, whose pages are rendered by PyMuPDF at 200 DPI. Images are converted to grayscale, small images are upscaled, and contrast is adjusted. Scanned PDFs are capped at `OCR_MAX_PAGES` pages.
3. **LLMWhisperer (optional):** used only when `UNSTRACT_API_KEY` is set and Tesseract returned less than `OCR_MIN_TEXT_LENGTH` characters.

Tesseract is the primary engine because it runs inside the container with no API key, network access or cost, and gives every reviewer the same result. Failures are handled softly: a corrupt file stores empty text and the upload still succeeds. `/api/health` reports whether Tesseract is available.

## Search

`GET /api/search?q=` runs a single MongoDB query (case-insensitive substring; the query text is escaped):

- `filename`, `division` and `metadata_text` are searched across all divisions, so a user can find a document and request access to it.
- `ocr_text` is searched only within documents the user can already open.

Results are newest first, capped at 100, and list the matched fields plus an OCR snippet when the text matched.

## Deployment

| | Local (`docker-compose.yml`) | Render (`render.yaml`) |
| :--- | :--- | :--- |
| Frontend | nginx container, port 3000 | `triad-dms-frontend` web service (same image) |
| Backend | gunicorn container, port 5000 | `triad-dms-backend` web service (same image) |
| Database | `mongo:7` container, named volume, port bound to localhost only | MongoDB Atlas |
| Secrets | local defaults | `SECRET_KEY` generated by Render; Atlas URI and admin password entered as secrets |
| Anonymous test upload | enabled (for the assignment script) | disabled |

- **Same-origin API:** nginx proxies `/api`, so the browser never makes cross-origin calls and the frontend build has no backend URL in it.
- **Start-up order:** Compose starts the backend only after MongoDB's health check passes, and the frontend only after the backend's. The backend retries the database connection for 30 seconds and refuses to start without one.
- **Seeding:** the container runs `seed_db.py` before gunicorn. It creates the default fields only when none exist, and accounts only when they are missing.

## Possible next steps

- Run OCR in a background worker so large scans don't hold the upload request open.
- Stream downloads from GridFS in chunks instead of reading the whole file into memory.
- Add a layout-aware OCR model as another step for tables and handwriting.
