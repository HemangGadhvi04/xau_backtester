#!/bin/bash
# Local environment setup script for your friend.
# This runs in their extracted project directory.

# Determine directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( dirname "$DIR" )"
cd "$ROOT_DIR"

echo "=================================================="
echo "⚙️  Setting up XAUUSD Backtesting Platform..."
echo "=================================================="

# 1. Initialize environment variables
if [ ! -f .env ]; then
    echo "-> Creating .env file from .env.example..."
    cp .env.example .env
    UNIQUE_JWT=$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))' 2>/dev/null || echo "fallback_jwt_secret_token_12345")
    sed "s/your_secure_random_string_here/$UNIQUE_JWT/" .env > .env.tmp && mv .env.tmp .env
    echo "✅ Created .env with custom JWT_SECRET."
else
    echo "-> .env file already exists. Skipping copy."
fi

# 2. Build and start Docker containers
echo "-> Starting Docker Compose containers..."
docker compose up --build -d

# 3. Log completion
echo "=================================================="
echo "🎉 SETUP COMPLETED SUCCESSFULLY!"
echo ""
echo "Access the platform dashboard here:"
echo "👉 http://localhost"
echo ""
echo "To stop the platform, run: docker compose down"
echo "=================================================="
