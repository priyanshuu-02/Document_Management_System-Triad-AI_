"""Application configuration, read entirely from environment variables.

Values come from the process environment (Docker / Render) or, for local
development, from ``backend/.env``.  Nothing secret is hardcoded here.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_list(name: str, default: str = "") -> list:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


class Config:
    # --- Security -----------------------------------------------------------
    # Required.  create_app() refuses to start without it so tokens are never
    # signed with a publicly known key.
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))

    # Exact origins allowed to call the API cross-origin.  In Docker and on
    # Render the frontend proxies /api, so requests are same-origin and this
    # list only matters for the Vite dev server.
    ALLOWED_ORIGINS = _env_list(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    )

    # --- Database -----------------------------------------------------------
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "TriadAI")
    # Seconds to keep retrying the initial MongoDB connection (covers the
    # container start-up race and Atlas cold connections).
    MONGO_CONNECT_TIMEOUT_SECONDS = int(os.getenv("MONGO_CONNECT_TIMEOUT_SECONDS", 30))
    # Opt-in only: fall back to an in-memory database when MongoDB is
    # unreachable.  Data is lost on restart, so never enable in production.
    ALLOW_IN_MEMORY_DB = _env_bool("ALLOW_IN_MEMORY_DB", False)

    # --- Uploads ------------------------------------------------------------
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB

    # The public assignment smoke test sends an anonymous upload.  This flag
    # lets that single endpoint accept it; keep it off on any public server.
    ALLOW_UNAUTHENTICATED_TEST_UPLOAD = _env_bool("ALLOW_UNAUTHENTICATED_TEST_UPLOAD", False)

    # --- OCR ----------------------------------------------------------------
    # Path to the tesseract binary when it is not on PATH (e.g. on Windows).
    TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
    OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "eng")
    # Upper bound on pages rasterised for scanned PDFs (protects CPU/memory).
    OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", 20))
    OCR_PDF_DPI = int(os.getenv("OCR_PDF_DPI", 200))
    # Below this many characters the Tesseract result is treated as weak and
    # the optional cloud OCR is tried (only if UNSTRACT_API_KEY is set).
    OCR_MIN_TEXT_LENGTH = int(os.getenv("OCR_MIN_TEXT_LENGTH", 20))
    UNSTRACT_API_KEY = os.getenv("UNSTRACT_API_KEY", "")

    # --- Seeding ------------------------------------------------------------
    # Run by seed_db.py (called from the container entrypoint).
    SEED_ON_START = _env_bool("SEED_ON_START", False)
    SEED_DEMO_USERS = _env_bool("SEED_DEMO_USERS", False)
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@triad.ai")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
    ADMIN_DIVISION = os.getenv("ADMIN_DIVISION", "Division A")
