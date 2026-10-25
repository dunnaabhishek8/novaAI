FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so Docker can cache this layer between code-only changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Don't run as root inside the container.
RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app

# Render injects $PORT. ONE worker on purpose: per-thread locks and the index cache live in-process.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
