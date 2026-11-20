# Triad AI - Document Management System

Take-home assignment for the Triad AI Full Stack Developer Internship.

A document management system with dynamic metadata, division-based access control, cross-division access requests and OCR search.

- **Repository:** https://github.com/priyanshuu-02/Document_Management_System-Triad-AI_
- **Live demo:** https://triad-dms-frontend.onrender.com
- **Stack:** Python 3.11 + Flask REST API, MongoDB + GridFS, Tesseract OCR, React 18 + Vite + Tailwind, Docker Compose

---

## Setup (Docker, recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with the Compose plugin).

```bash
git clone https://github.com/priyanshuu-02/Document_Management_System-Triad-AI_.git
cd Document_Management_System-Triad-AI_
docker compose up --build
```

The first build takes a few minutes. Then open:

| What | URL |
| :--- | :--- |
| Web app | http://localhost:3000 |
| REST API | http://localhost:5000/api (health check: `/api/health`) |

No configuration is needed. Each machine gets its own MongoDB container and data volume. On first start the backend creates the default metadata fields and these accounts:

| Email | Password | Role | Division |
| :--- | :--- | :--- | :--- |
| `admin@triad.ai` | `Password123!` | Admin | Division A |
| `alice@triad.ai` | `Password123!` | User | Division A |
| `bob@triad.ai` | `Password123!` | User | Division B |

To try the access workflow, log in as Bob, search for one of Alice's documents and request access. Then log in as Alice and approve the request from the Access Requests page.

Stop with `docker compose down`; add `-v` to also delete the data.

### Running the tests

With the stack running:

```bash
pip install requests
python test_api.py                          # assignment test script -> test_report.txt
python backend/tests/integration_suite.py   # 13 end-to-end checks -> integration_report.txt

# unit tests (access control, search, OCR), run inside the backend image
docker compose run --rm -v ./backend/tests:/app/tests backend python -m unittest discover -s tests -v
```

The assignment script uploads without logging in. The local Compose file enables `ALLOW_UNAUTHENTICATED_TEST_UPLOAD` for that one endpoint; it is off by default and off on the live deployment.

---

## Setup without Docker

Backend (needs MongoDB running locally, or an Atlas connection string):

```bash
cd backend
python -m venv venv
venv\Scripts\activate             # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp; then set MONGO_URI and SECRET_KEY
python seed_db.py                 # default metadata fields + accounts above
python run.py                     # http://localhost:5000
```

OCR for images and scanned PDFs needs [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) installed. Set `TESSERACT_CMD` in `.env` if it isn't on `PATH`. Without Tesseract, uploads still work and digital PDFs are still indexed.

Frontend:

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to port 5000)
```

---

## Deploying to Render

`render.yaml` deploys the same two Docker images, with MongoDB Atlas as the database.

1. In MongoDB Atlas, allow network access from `0.0.0.0/0` and copy the `mongodb+srv://` connection string.
2. In Render, choose **New > Blueprint** and select this repository.
3. Fill in the prompted values:
   - `MONGO_URI`: the Atlas connection string
   - `ADMIN_PASSWORD`: a strong password for `admin@triad.ai`
   - `BACKEND_URL`: `https://triad-dms-backend.onrender.com`, or the backend URL Render shows
   - `UNSTRACT_API_KEY`: optional, can be left empty
4. Open the `triad-dms-frontend` URL once both services are live.

Render generates `SECRET_KEY` automatically, and anonymous uploads are disabled.

---

## How the requirements are met

| Requirement | Implementation |
| :--- | :--- |
| Dynamic metadata | Field definitions are stored in the `metadata_fields` collection. Admins add, edit and delete fields and their options on the Admin / Settings page. Each document stores its metadata as a free-form object, so no field is hardcoded. |
| Division isolation | Each user belongs to one division. An upload is rejected (403) unless it targets the uploader's division. The document list returns only the user's division plus documents they were approved for. |
| Access requests | Users request access to another division's document. A member or admin of the owning division approves or rejects the request, and downloads require an approved request. Admins can revoke access, and every decision is written to an audit log. |
| OCR and search | Text is extracted at upload: the embedded PDF text first, then Tesseract for images and scanned PDFs, then optionally Unstract LLMWhisperer when `UNSTRACT_API_KEY` is set. `/api/search` matches titles, metadata and OCR text. |
| Flask, REST API, MongoDB, GridFS | Flask blueprints under `/api`. Files are stored in GridFS, and document records hold the metadata, OCR text and file reference. |
| Docker | `docker-compose.yml` runs MongoDB, the API (gunicorn) and the React app (nginx, which proxies `/api` to the API). |

Search rule: titles and metadata are searchable across divisions, so users can find a document and request it. OCR content is searched only within documents the user can already open, so search never reveals another division's contents.

Design details are in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## REST API

Every endpoint except register, login, health and the metadata field list requires `Authorization: Bearer <token>`.

| Method and path | Purpose |
| :--- | :--- |
| `POST /api/auth/register` | `{username, email, password, division}`. Always creates a regular user. |
| `POST /api/auth/login` | `{identifier or email or username, password}`. Returns `{token, user}`. |
| `GET /api/auth/me` | Current user |
| `POST /api/documents/upload` | Multipart `file` + `metadata` JSON string, e.g. `{"Division": "Division A", "Report Type": "Financial"}` |
| `GET /api/documents` | Documents visible to the user; filter by any metadata field, e.g. `?Report Type=Financial` |
| `GET /api/documents/<doc_id>` | Details (OCR text withheld without access) |
| `GET /api/documents/<doc_id>/download` | File from GridFS, or 403 without access |
| `POST /api/access/request` | `{doc_id}` |
| `POST /api/access/approve` and `/reject` | `{request_id, note?}` |
| `POST /api/access/revoke` | `{request_id, note?}`, admin only |
| `GET /api/access/inbox` and `/my-requests` | Incoming requests for the user's division, and requests the user sent |
| `GET /api/search?q=<query>` | Titles, metadata and permitted OCR text, with matched fields and a snippet |
| `GET, POST /api/admin/metadata-fields`, `PUT, DELETE /api/admin/metadata-fields/<id>` | Manage metadata fields (changes are admin only) |
| `GET /api/admin/users`, `POST /api/admin/users/<id>/role` and `/division` | User management, admin only |
| `GET /api/admin/audit-events` | Audit log, admin only |

---

## Configuration

Backend environment variables (full list in [`backend/.env.example`](backend/.env.example)):

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `MONGO_URI`, `MONGO_DB_NAME` | `mongodb://localhost:27017`, `TriadAI` | Database |
| `SECRET_KEY` | required | Signs login tokens |
| `ALLOW_UNAUTHENTICATED_TEST_UPLOAD` | `false` | Accept the assignment script's anonymous upload |
| `ALLOW_IN_MEMORY_DB` | `false` | Use a temporary in-memory database if MongoDB is unreachable |
| `TESSERACT_CMD`, `OCR_LANGUAGES`, `OCR_MAX_PAGES`, `OCR_PDF_DPI` | none, `eng`, `20`, `200` | OCR settings |
| `UNSTRACT_API_KEY` | empty | Optional cloud OCR fallback |
| `SEED_ON_START`, `SEED_DEMO_USERS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_DIVISION` | see `.env.example` | Initial accounts |

Docker Compose overrides (for example, using Atlas locally) go in a root `.env` file; see [`.env.example`](.env.example).

---

## Project structure

```
backend/
  app/
    api/          REST routes: auth, documents, access, search, admin
    services/     business logic: access checks, upload, OCR, search
    models/       MongoDB document shapes
    middleware/   JWT auth, error handling
    config.py     environment configuration
    db.py         MongoDB / GridFS connection and indexes
    seed.py       default metadata fields and accounts
  tests/          unit tests and end-to-end suite
  seed_db.py      seeding command (run on container start)
  Dockerfile      Python + Tesseract + gunicorn
frontend/
  src/pages/      Login/Signup, Dashboard, Document Details, Access Requests, Search, Admin
  nginx/          nginx config (serves the app, proxies /api)
  Dockerfile      Node build + nginx
docker-compose.yml   local stack
render.yaml          Render deployment
test_api.py          assignment test script
```
