#!/bin/bash
# Clean packaging script to create the zip file for your friend.
# Sets up a temp staging directory, runs the audit on it, and zips it.

# Determine directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( dirname "$DIR" )"
cd "$ROOT_DIR"

STAGE_DIR="staging_package"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

echo "📂 Creating clean staging environment..."
# Copy source files to staging, respecting exclusions
rsync -a --exclude='.git' \
         --exclude='node_modules' \
         --exclude='venv' \
         --exclude='.venv' \
         --exclude='__pycache__' \
         --exclude='postgres_data' \
         --exclude='redis_data' \
         --exclude='data/raw' \
         --exclude='*.sqlite3' \
         --exclude='*.db' \
         --exclude='dump.rdb' \
         --exclude='scratch' \
         --exclude='*.log' \
         --exclude='.env' \
         --exclude='.env.*' \
         --exclude='xau_backtester_friend_package.zip' \
         --exclude='staging_package' \
         . "$STAGE_DIR/"

# Run safety audit on the staging folder
./scripts/check_no_secrets.sh "$STAGE_DIR"
AUDIT_STATUS=$?

if [ $AUDIT_STATUS -ne 0 ]; then
    echo "❌ Packaging aborted due to safety violations in staging folder!"
    rm -rf "$STAGE_DIR"
    exit 1
fi

echo "📦 Zipping staging files..."
ZIP_NAME="xau_backtester_friend_package.zip"
rm -f "$ZIP_NAME"

cd "$STAGE_DIR"
zip -r "../$ZIP_NAME" . > /dev/null
cd ..

rm -rf "$STAGE_DIR"

echo "=================================================="
echo "✅ ARCHIVE CREATED SUCCESSFULLY!"
echo "Package file: $ZIP_NAME"
echo "=================================================="
