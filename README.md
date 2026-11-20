# Triad AI - Document Management System

Assignment for the Triad AI Full Stack Developer Internship.

You can upload documents, tag them with metadata fields that an admin sets up, and keep each division's documents private to that division. Someone from another division can ask for access, and the owning division approves or rejects. Every upload is run through OCR so the text inside it can be searched.

- **Live demo:** https://triad-dms-frontend.onrender.com (free hosting: after a quiet spell the first load takes up to a minute). Log in with the demo accounts below, or use the 1-click buttons on the login page.
- **Built with:** Python 3.11 + Flask (REST API), MongoDB + GridFS, Tesseract OCR, React 18 + Vite + Tailwind, Docker Compose

---

## Run it with Docker (recommended)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose).

```bash
git clone https://github.com/priyanshuu-02/Document_Management_System-Triad-AI_.git
cd Document_Management_System-Triad-AI_
docker compose up --build
```

The first build takes a few minutes. Then open:

| What | Address |
| :--- | :--- |
| Web app | http://localhost:3000 |
| REST API | http://localhost:5000/api (health check: `/api/health`) |

Nothing else to set up. Docker starts its own MongoDB on your computer, and on the first start it creates the default metadata fields and these accounts. The same accounts work on the live demo:

| Email | Password | Role | Division |
| :--- | :--- | :--- | :--- |
| `admin@triad.ai` | `Password123!` | Admin | Division A |
| `alice@triad.ai` | `Password123!` | User | Division A |
| `bob@triad.ai` | `Password123!` | User | Division B |

These are public test accounts, so the live demo's data is demo data only and may be reset.

**Quick tour:** log in as Alice and upload a PDF or an image. Log in as Bob: he can't see it in his list, but he can find it on the Search page and click Request Access. Log in as Alice again, approve it on the Access Requests page, and Bob can now download it.

Stop with `docker compose down` (add `-v` to delete the data as well).

### Tests

With the app running:

```bash
pip install requests
python test_api.py                          # the company's test script -> test_report.txt
python backend/tests/integration_suite.py   # 13 end-to-end checks -> integration_report.txt

# unit tests (access rules, security, search, OCR), run inside the backend container
docker compose run --rm -v ./backend/tests:/app/tests backend python -m unittest discover -s tests -v
```

The company's script uploads a file without logging in. To let it pass, the local Docker setup turns on `ALLOW_UNAUTHENTICATED_TEST_UPLOAD` for that one endpoint. It's off by default and off on the live site.

---

## Run it without Docker

Backend (needs a MongoDB, either local or Atlas):

```bash
cd backend
python -m venv venv
venv\Scripts\activate             # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp. Then set MONGO_URI and SECRET_KEY
python seed_db.py                 # default fields + the accounts above
python run.py                     # http://localhost:5000
```

Reading images and scanned PDFs needs [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) installed. If it isn't on your `PATH`, set `TESSERACT_CMD` in `.env`. Without it, uploads still work and normal PDFs are still searchable.

Frontend:

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (sends /api to port 5000)
```

---

## Deploy to Render

`render.yaml` deploys the same two Docker images, with MongoDB Atlas as the database.

1. In MongoDB Atlas, allow network access from `0.0.0.0/0` and copy the `mongodb+srv://` connection string.
2. In Render, click **New > Blueprint** and pick this repository.
3. Fill in the values it asks for:
   - `MONGO_URI`: the Atlas connection string
   - `ADMIN_PASSWORD`: a strong password for `admin@triad.ai`
   - `BACKEND_URL`: `https://triad-dms-backend.onrender.com` (or whatever backend address Render shows)
   - `UNSTRACT_API_KEY`: optional, leave empty
4. When both services are live, open the `triad-dms-frontend` address.

Render creates the `SECRET_KEY` itself, and anonymous uploads stay off.

---

## How each requirement is covered

| Requirement | How |
| :--- | :--- |
| Dynamic metadata | Fields live in the database (`metadata_fields`), not in the code. On the Admin page an admin can add a field, rename it, change its options (for example add a new Report Type) or delete it. The upload form, the dashboard filters and the search filters are all built from this list, so a new field shows up everywhere without code changes. |
| Divisions | "Division" is one of these fields too. Its options are the list of divisions, used on the sign-up page and in every division dropdown. Because access control depends on it, it can't be deleted or renamed, only edited. |
| Division isolation | A normal user can only upload into their own division (anything else gets 403). They only see their own division's documents, plus ones they were approved for. These checks happen on the server. |
| Access requests | Bob asks for a Division A document. Only a Division A member or an admin can approve or reject it. Downloading needs an approved request. Admins can take access back later. Every step goes into an audit log. |
| OCR and search | On upload we read the text already inside the PDF. If there isn't any (images, scanned PDFs), Tesseract reads it from the picture. LLMWhisperer is an optional extra if `UNSTRACT_API_KEY` is set. `/api/search` looks through names, metadata and this text. |
| Flask, REST, MongoDB, GridFS | Flask REST API under `/api`. The files themselves are stored in GridFS. |
| Docker | `docker-compose.yml` runs MongoDB, the API (gunicorn) and the React app (nginx, which also passes `/api` on to the API). |

**Search rule:** anyone can find a document by its name or metadata, so they know it exists and can ask for it. The text inside a document is only searched if you're allowed to open it, so search never gives away what's in another division's files.

More detail: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Security

- Passwords are stored as bcrypt hashes. Sign-up needs a valid email and a password of at least 8 characters.
- Logins use signed tokens (JWT, HS256) that expire after 24 hours. On every request the user is loaded again from the database, so a changed role or a deleted account takes effect immediately.
- Sign-up always creates a normal user. Admins are created by the seed script or promoted by another admin.
- All input is checked: only plain text reaches database queries (so `{"$ne": ""}` tricks don't work), metadata field names can't start with `$` or contain `.`, and search text is escaped.
- Files are always sent as downloads, never opened inside the site. nginx adds a Content Security Policy and anti-framing headers.
- Errors never show internal details. No secrets are in the code or the repo: they come from environment variables, and `.env` files are git-ignored.
- In Docker, every port is only opened on your own computer (127.0.0.1).

**Known limits:** there's no limit on repeated login attempts, and the login token is kept in the browser's localStorage. For a real deployment I'd add rate limiting and move the token to an HttpOnly cookie.

---

## REST API

Everything except sign-up, login, health and the metadata field list needs `Authorization: Bearer <token>`.

| Method and path | What it does |
| :--- | :--- |
| `POST /api/auth/register` | `{username, email, password, division}`. Always creates a normal user. |
| `POST /api/auth/login` | `{identifier (email or username), password}`. Returns `{token, user}`. |
| `GET /api/auth/me` | The logged-in user |
| `POST /api/documents/upload` | Form data: `file` plus `metadata` as a JSON string, e.g. `{"Division": "Division A", "Report Type": "Financial"}` |
| `GET /api/documents` | Documents you can see. Filter by any field, e.g. `?Report Type=Financial` (admins can also use `?division=`) |
| `GET /api/documents/<doc_id>` | Details (the OCR text is hidden if you can't open it) |
| `GET /api/documents/<doc_id>/download` | The file, or 403 if you don't have access |
| `POST /api/access/request` | `{doc_id}` |
| `POST /api/access/approve`, `/reject` | `{request_id, note?}` |
| `POST /api/access/revoke` | `{request_id, note?}`, admins only |
| `GET /api/access/inbox`, `/my-requests` | Requests for your division's documents, and requests you sent |
| `GET /api/search?q=<words>` | Search names, metadata and (allowed) OCR text |
| `GET, POST /api/admin/metadata-fields`, `PUT, DELETE /api/admin/metadata-fields/<id>` | Metadata fields (changes are admin only) |
| `GET /api/admin/users`, `POST /api/admin/users/<id>/role`, `/division` | Manage users, admins only |
| `GET /api/admin/audit-events` | Audit log, admins only |

---

## Settings

Backend environment variables (full list in [`backend/.env.example`](backend/.env.example)):

| Variable | Default | What it's for |
| :--- | :--- | :--- |
| `MONGO_URI`, `MONGO_DB_NAME` | `mongodb://localhost:27017`, `TriadAI` | Database |
| `SECRET_KEY` | required | Signs login tokens |
| `ALLOW_UNAUTHENTICATED_TEST_UPLOAD` | `false` | Let the company's test script upload without logging in |
| `ALLOW_IN_MEMORY_DB` | `false` | Use a throwaway in-memory database if MongoDB is down |
| `TESSERACT_CMD`, `OCR_LANGUAGES`, `OCR_MAX_PAGES`, `OCR_PDF_DPI` | none, `eng`, `20`, `200` | OCR |
| `UNSTRACT_API_KEY` | empty | Optional cloud OCR |
| `SEED_ON_START`, `SEED_DEMO_USERS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_DIVISION` | see `.env.example` | First-run accounts |

For Docker, put overrides (for example an Atlas `MONGO_URI`) in a `.env` file next to `docker-compose.yml`. See [`.env.example`](.env.example).

---

## Folder layout

```
backend/
  app/
    api/          the REST routes: auth, documents, access, search, admin
    services/     the rules: access checks, upload, OCR, search
    models/       how each kind of record is stored
    middleware/   login checks and error handling
    validation.py checks on incoming data
    config.py     settings
    db.py         MongoDB and GridFS connection
    seed.py       default fields and accounts
  tests/          unit tests and the end-to-end suite
  seed_db.py      runs the seeding (on container start)
  Dockerfile      Python + Tesseract + gunicorn
frontend/
  src/pages/      Login/Sign-up, Dashboard, Document Details, Access Requests, Search, Admin
  src/api/        talking to the backend, shared data
  nginx/          serves the app and passes /api to the backend
  Dockerfile      builds the app and serves it with nginx
docker-compose.yml   runs everything locally
render.yaml          Render deployment
test_api.py          the company's test script, unchanged
```
