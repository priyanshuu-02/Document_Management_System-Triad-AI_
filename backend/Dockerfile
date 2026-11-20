# Flask REST API with Tesseract OCR, served by gunicorn.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=5000

# Tesseract OCR engine + English language data (the only system packages needed;
# PyMuPDF and Pillow ship as self-contained wheels).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','5000'), timeout=4)" || exit 1

# Seed (opt-in via SEED_ON_START), then hand PID 1 to gunicorn.
# PORT is provided by Docker Compose locally and by Render in the cloud.
CMD ["sh", "-c", "python seed_db.py --if-enabled && exec gunicorn 'run:app' --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS:-2} --threads ${GUNICORN_THREADS:-4} --timeout ${GUNICORN_TIMEOUT:-180} --access-logfile -"]
