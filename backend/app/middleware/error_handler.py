"""Turns every error into a short JSON reply.

Real error details (stack traces, database messages) are written to the
server log only, never sent to the browser.
"""
import logging
from flask import jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)


def register_error_handlers(app):
    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({"error": "File exceeds maximum upload limit (50 MB)", "status": 413}), 413

    @app.errorhandler(HTTPException)
    def http_error(error):
        # 400, 404, 405 and the like: a known problem with a safe message.
        return jsonify({"error": error.description or error.name, "status": error.code}), error.code

    @app.errorhandler(Exception)
    def unexpected_error(error):
        # Anything we didn't expect: log it fully, tell the user very little.
        logger.exception("Unhandled error: %s", error)
        return jsonify({"error": "Internal server error occurred", "status": 500}), 500
