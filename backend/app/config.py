"""All settings, read from environment variables.

In Docker and on Render they come from the container's environment. When you
run the backend by hand they come from backend/.env. No passwords or keys are
written in the code.
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
    # Signs the login tokens. Required: the app won't start without it.
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))

    # Websites allowed to call the API directly from the browser. Normally
    # the browser goes through nginx on the same address, so this only
    # matters for the Vite dev server.
    ALLOWED_ORIGINS = _env_list(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    )

    # --- Database -----------------------------------------------------------
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "TriadAI")
    # How long to keep trying to reach MongoDB at start-up (it may still be
    # booting in Docker, or slow to answer on Atlas).
    MONGO_CONNECT_TIMEOUT_SECONDS = int(os.getenv("MONGO_CONNECT_TIMEOUT_SECONDS", 30))
    # If true and MongoDB can't be reached, use a temporary in-memory database
    # instead. Everything is lost on restart, so leave this off normally.
    ALLOW_IN_MEMORY_DB = _env_bool("ALLOW_IN_MEMORY_DB", False)

    # --- Uploads ------------------------------------------------------------
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB

    # The company's test script uploads without logging in. Turning this on
    # lets that one endpoint accept it. Keep it off on any public server.
    ALLOW_UNAUTHENTICATED_TEST_UPLOAD = _env_bool("ALLOW_UNAUTHENTICATED_TEST_UPLOAD", False)

    # --- OCR ----------------------------------------------------------------
    # Full path to tesseract if it isn't on PATH (mainly on Windows).
    TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
    OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "eng")
    # Most pages of a scanned PDF we will OCR (keeps big files from hogging the server).
    OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", 20))
    OCR_PDF_DPI = int(os.getenv("OCR_PDF_DPI", 200))
    # If Tesseract finds fewer characters than this, try the optional
    # LLMWhisperer cloud OCR (only when UNSTRACT_API_KEY is set).
    OCR_MIN_TEXT_LENGTH = int(os.getenv("OCR_MIN_TEXT_LENGTH", 20))
    UNSTRACT_API_KEY = os.getenv("UNSTRACT_API_KEY", "")

    # --- First-run accounts (used by seed_db.py) ------------------------------
    SEED_ON_START = _env_bool("SEED_ON_START", False)
    SEED_DEMO_USERS = _env_bool("SEED_DEMO_USERS", False)
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@triad.ai")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
    ADMIN_DIVISION = os.getenv("ADMIN_DIVISION", "Division A")
