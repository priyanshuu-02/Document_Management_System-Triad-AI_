"""Flask application factory for the Triad AI Document Management System."""
import logging

from flask import Flask, jsonify
from flask_cors import CORS

from app.config import Config
from app.db import db_manager
from app.middleware.error_handler import register_error_handlers
from app.api.auth_routes import auth_bp
from app.api.doc_routes import doc_bp
from app.api.access_routes import access_bp
from app.api.search_routes import search_bp
from app.api.admin_routes import admin_bp
from app.services.doc_service import backfill_metadata_text
from app.services.ocr_service import OCRService

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
)
logger = logging.getLogger(__name__)


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("SECRET_KEY is not set. Define it in backend/.env or the container environment.")

    if app.config.get("ALLOW_UNAUTHENTICATED_TEST_UPLOAD"):
        logger.warning("ALLOW_UNAUTHENTICATED_TEST_UPLOAD is enabled: anonymous uploads are accepted. "
                       "Use only for the local assignment test harness.")

    # 1. CORS: exact origins only.  In Docker/Render the frontend proxies /api
    #    so browser calls are same-origin; this covers the Vite dev server.
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config.get("ALLOWED_ORIGINS", [])}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        expose_headers=["Content-Disposition"],
    )

    # 2. Database & GridFS.  Tests pre-configure db_manager and skip this.
    with app.app_context():
        if db_manager.db is None:
            db_manager.initialize(
                mongo_uri=app.config.get("MONGO_URI"),
                db_name=app.config.get("MONGO_DB_NAME"),
            )
        try:
            backfilled = backfill_metadata_text(db_manager.db)
            if backfilled:
                logger.info("Backfilled searchable metadata for %d existing document(s).", backfilled)
        except Exception as err:  # never block start-up on a maintenance task
            logger.warning("metadata_text backfill skipped: %s", err)

    # 3. Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(doc_bp)
    app.register_blueprint(access_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(admin_bp)

    # 4. Error handlers
    register_error_handlers(app)

    # 5. Health check (used by Docker and Render)
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({
            "status": "healthy",
            "service": "Triad AI - Document Management System API",
            "database_mode": "mock_in_memory" if db_manager.is_mock else "mongodb_live",
            "database_name": db_manager.db.name if db_manager.db is not None else None,
            "ocr_tesseract_available": OCRService.tesseract_available(),
            "ocr_cloud_fallback_configured": bool(app.config.get("UNSTRACT_API_KEY")),
        }), 200

    return app
