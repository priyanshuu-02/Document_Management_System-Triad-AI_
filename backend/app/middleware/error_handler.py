from flask import jsonify
import logging

logger = logging.getLogger(__name__)

def register_error_handlers(app):
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"error": str(error.description or "Bad request"), "status": 400}), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({"error": str(error.description or "Unauthorized"), "status": 401}), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({"error": str(error.description or "Access forbidden"), "status": 403}), 403

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": str(error.description or "Resource not found"), "status": 404}), 404

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({"error": "File exceeds maximum upload limit", "status": 413}), 413

    @app.errorhandler(500)
    def internal_server_error(error):
        logger.error(f"Internal server error: {error}")
        return jsonify({"error": "Internal server error occurred", "status": 500}), 500
