# Architecture

## The big picture

```
Browser
   │  HTTPS
   ▼
nginx (frontend container)
   ├─ serves the React app
   └─ /api/*  ──passes on to──►  Flask API (gunicorn, backend container)
                                    ├─ auth: JWT tokens + bcrypt passwords
                                    ├─ documents: upload, list, details, download
                                    ├─ access: request / approve / reject / revoke
                                    ├─ search
                                    ├─ admin: metadata fields, users, audit log
                                    └─ OCR: PDF text → Tesseract → LLMWhisperer (optional)
                                          │
                                          ▼
                                    MongoDB: collections + GridFS (the files)
```

The backend has three layers:
- **Routes** (`app/api`) read the request and send the reply.
- **Services** (`app/services`) hold the rules, such as who may open what.
- **Models** (`app/models`) describe how each record is stored.

Anything that comes from the user is checked in `app/validation.py` before it is used.

## Database

| Collection | Main fields | Notes |
| :--- | :--- | :--- |
| `users` | `username`, `email`, `password_hash`, `division`, `role` (`user` or `admin`) | Email and username are unique |
| `metadata_fields` | `name`, `field_type` (`select`, `text`, `number`), `options`, `required` | The fields admins set up. The UI is built from this list |
| `documents` | `filename`, `content_type`, `file_size`, `division`, `metadata`, `metadata_text`, `ocr_text`, `gridfs_id`, `uploaded_by`, `created_at` | `metadata_text` is the metadata as one line of text, for search |
| `access_requests` | `doc_id`, `doc_division`, `requested_by_id`, `requester_division`, `status`, reviewer and revoke details | Status is `pending`, `approved`, `rejected` or `revoked` |
| `audit_events` | `event_type`, who did it, who it was about, the document, `note`, `created_at` | Only ever added to, never changed or deleted |
| `fs.files`, `fs.chunks` | GridFS | The uploaded files themselves |

Indexes are created at start-up (`app/db.py`) for the lookups we actually do: documents by division and date, requests by document + user + status, the inbox by division + status, and unique email, username and field name.

### Metadata fields

Fields are data, not code. The upload form, the dashboard filters and the search filters all read `metadata_fields` and build their inputs from it. A document stores whatever fields it was given in its `metadata` object, and the list endpoint turns any query parameter into a filter on that field (`?Report Type=Financial` → `metadata.Report Type = Financial`). So adding a field, renaming one, or adding a new option needs no code change and no database migration.

**Division** is also one of these fields. Its options are the list of divisions, shown on the sign-up page and in every division dropdown. An admin adds a new division by adding an option. Because access control is built on divisions, this one field can't be deleted or renamed, and sign-up only accepts a division from its list.

## Who can open what

The check lives in `AccessContext` in `app/services/doc_service.py`:

1. **Admin:** any document.
2. **Same division:** the document.
3. **Approved request:** that one document.
4. **Anyone else:** only the metadata. The OCR text is removed from the reply, and download returns 403.

`AccessContext` loads all of a user's approved and pending requests with one query, then checks each document in memory. A list of 100 documents costs the same few queries as a list of one.

Other rules:
- The user is loaded from the database on every request (not trusted from the token), so a role change, a division change or a deleted account takes effect immediately.
- A normal user can only upload into their own division (otherwise 403). Only admins can choose another division.
- Sign-up always creates a normal `user`. Admins come from the seed script or are promoted by another admin, and an admin can't demote themselves.

### Access request steps

```
request ──► pending ──approve──► approved ──revoke (admin)──► revoked
                    └─reject───► rejected
```

- Only members or admins of the document's division can approve or reject.
- After a rejection or revoke the user can ask again, and an old rejection never hides a newer approval.
- Every step adds a record to `audit_events`.

## OCR

In `app/services/ocr_service.py`. Each step only runs if the one before found no usable text:

1. **Text inside the PDF:** most PDFs made on a computer already contain their text. We read it with pypdf (pdfplumber as a backup). Fast and exact.
2. **Tesseract:** for images (PNG, JPEG, TIFF, BMP, GIF, WebP) and scanned PDFs. PDF pages are first turned into pictures with PyMuPDF at 200 DPI. Images are turned grey, enlarged if small, and given more contrast, which helps Tesseract. At most `OCR_MAX_PAGES` pages are read.
3. **LLMWhisperer (optional):** only if `UNSTRACT_API_KEY` is set and Tesseract found fewer than `OCR_MIN_TEXT_LENGTH` characters.

Tesseract is the main engine because it runs inside our own container: no API key, no internet, no cost, and every reviewer gets the same result. If a file is broken, we store no text and the upload still works. `/api/health` shows whether Tesseract is available.

## Search

`GET /api/search?q=` is one MongoDB query. It ignores upper/lower case, and the search text is escaped so it can't be used as a pattern.

- `filename`, `division` and `metadata_text` are searched in every division, so a user can find a document and ask for it.
- `ocr_text` is only searched in documents the user can already open.

Results come newest first, at most 100, and say which fields matched, with a short snippet when the OCR text matched.

## Security

| Risk | What stops it |
| :--- | :--- |
| Seeing another division's files | Every list, detail, search and download is checked on the server. OCR text is removed when you have no access. |
| Making yourself an admin | Sign-up ignores any `role` sent. Only an admin can promote someone. |
| Fake or old tokens | Tokens are signed with `SECRET_KEY` (HS256 only) and expire after 24 h. The user must still exist in the database. |
| NoSQL injection (e.g. `{"$ne": ""}` as a password) | Only plain strings reach queries. Metadata field names can't start with `$` or contain `.`. Search text is escaped. |
| Uploaded HTML or scripts running on the site | Files are always sent as downloads with `nosniff`. nginx adds a Content Security Policy that blocks inline scripts. |
| Click-jacking | `X-Frame-Options: DENY` and `frame-ancestors 'none'`. |
| Leaking internals in errors | Errors are short JSON messages. Details only go to the server log. |
| Secrets in the repo | None. Keys and the database address come from environment variables, and `.env` is git-ignored. Render generates `SECRET_KEY`. |
| Open ports | In Docker, MongoDB, the API and the app are only opened on 127.0.0.1. Containers run as a normal user, not root. |

Not covered yet: there is no limit on repeated login attempts, and the token sits in localStorage (readable by any script on the page, which the CSP makes hard to inject). A real deployment should add rate limiting and use an HttpOnly cookie.

## Deployment

| | Local (`docker-compose.yml`) | Render (`render.yaml`) |
| :--- | :--- | :--- |
| Frontend | nginx container, port 3000 | `triad-dms-frontend` (same image) |
| Backend | gunicorn container, port 5000 | `triad-dms-backend` (same image) |
| Database | `mongo:7` container with a volume | MongoDB Atlas |
| Secrets | local defaults | `SECRET_KEY` made by Render; Atlas address and admin password entered as secrets |
| Anonymous test upload | on (for the company's test script) | off |

- **One address for the browser:** nginx passes `/api` on to the backend, so the browser never calls a second site and the frontend has no backend address built in.
- **Start-up order:** the backend waits for MongoDB to be healthy, and the frontend waits for the backend. The backend retries MongoDB for 30 seconds and refuses to start without it.
- **Free-tier sleep:** while a sleeping Render service wakes up, Render answers 502/503. The frontend pings `/api/health` as soon as the page opens and retries those answers every 5 seconds for about 50 seconds, so the first visit is slow instead of broken.
- **Polling:** the sidebar badge, the bell, the dashboard counter and the Access Requests page share one timer (`src/api/accessRequestsStore.js`): every 15 s, every 5 s on the requests page, paused while the tab is hidden.
- **Render DNS:** nginx looks up the backend through public DNS (`NGINX_RESOLVER`), because Render's own DNS sends `*.onrender.com` to a private network free services can't use.
- **Seeding:** the container runs `seed_db.py` before gunicorn. Default fields are only added to an empty database, the Division field is always made sure to exist, and accounts are only created if missing.

## What I'd do next

- Run OCR in a background job, so big scans don't keep the upload waiting.
- Send downloads from GridFS in pieces instead of loading the whole file into memory.
- Add login rate limiting and HttpOnly cookies.
- Add a layout-aware OCR model for tables and handwriting.
