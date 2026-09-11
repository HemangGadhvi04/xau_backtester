#!/bin/bash

# Production Start Script for Backend & Celery Worker

echo "Starting Market Replay Production Environment..."

# 1. Activate virtual environment
source venv/bin/activate

# 2. Run Database Migrations to ensure schema is up-to-date
echo "Running Alembic migrations..."
cd backend
alembic upgrade head
cd ..

# 3. Start Celery Worker in the background
# We pipe output to worker.log to prevent polluting the terminal
echo "Starting Celery Worker..."
celery -A backend.worker worker --loglevel=info > worker.log 2>&1 &
CELERY_PID=$!

# 4. Start Gunicorn with Uvicorn workers
# Using 4 workers for handling concurrent connections efficiently
echo "Starting FastAPI Backend..."
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 &
GUNICORN_PID=$!

echo "Backend is running on http://127.0.0.1:8000"
echo "Celery worker is running (PID: $CELERY_PID)"
echo "Press Ctrl+C to stop all services."

# Trap SIGINT and SIGTERM to kill background processes on exit
trap "echo 'Shutting down...'; kill $CELERY_PID $GUNICORN_PID; exit" SIGINT SIGTERM

# Wait for background processes
wait
