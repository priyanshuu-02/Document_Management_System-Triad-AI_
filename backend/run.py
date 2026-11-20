"""Starts the backend for local development (python run.py).
In Docker and on Render, gunicorn starts it instead (see the Dockerfile)."""
import os
from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Triad AI Document Management System on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
