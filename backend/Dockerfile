FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt bcrypt

# Copy application code
COPY backend/ ./backend/
COPY core/ ./core/
COPY strategies/ ./strategies/
COPY download_dukascopy_xau.py .


# Set environment variables
ENV PYTHONPATH=/app

# Create directory for SQLite database and screenshots
RUN mkdir -p /app/data/screenshots

# Create non-root user and set permissions
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Default command (can be overridden by docker-compose for celery)
CMD ["gunicorn", "backend.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
