#!/bin/bash
# Pre-packaging security auditor script.
# Returns 0 if clear, 1 if any forbidden secrets are found.

# Determine target directory (defaults to repo root)
TARGET_DIR="${1:-.}"
if [ "$TARGET_DIR" = "." ]; then
    DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    TARGET_DIR="$( dirname "$DIR" )"
fi
cd "$TARGET_DIR"

echo "=================================================="
echo "🛡️  Running Secret Safety Scan..."
echo "=================================================="

FORBIDDEN_FILES=(
    ".env"
    ".env.local"
    ".env.production"
    "*.pem"
    "*.key"
    "id_rsa"
    "dump.rdb"
    "db.sqlite3"
)

FOUND_FILES=0
for pattern in "${FORBIDDEN_FILES[@]}"; do
    find_res=$(find . -maxdepth 3 -name "$pattern" -not -path "*/node_modules/*" -not -path "*/venv/*" -not -path "*/.venv/*" -not -path "*/.git/*" 2>/dev/null)
    if [ -n "$find_res" ]; then
        echo "❌ Violation: Found forbidden file(s):"
        echo "$find_res"
        FOUND_FILES=1
    fi
done

# Check for private patterns inside text files
# Search strings
SECRETS_PATTERN="(JWT_SECRET|SECRET_KEY|API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|PRIVATE_KEY) *= *[a-zA-Z0-9_\-]{16,}"

echo "🔍 Checking codebase for hardcoded keys..."
grep_res=$(grep -rnE "$SECRETS_PATTERN" . \
    --exclude-dir=node_modules \
    --exclude-dir=venv \
    --exclude-dir=.venv \
    --exclude-dir=.git \
    --exclude-dir=scripts \
    --exclude="*.md" \
    --exclude="*.example" \
    --exclude=".gitignore" \
    --exclude=".dockerignore" \
    --exclude="*.log" 2>/dev/null)

if [ -n "$grep_res" ]; then
    echo "❌ Violation: Hardcoded secret pattern detected:"
    echo "$grep_res"
    FOUND_FILES=1
fi

if [ $FOUND_FILES -eq 1 ]; then
    echo "=================================================="
    echo "❌ SAFETY AUDIT FAILED! Clean up before packaging."
    echo "=================================================="
    exit 1
else
    echo "=================================================="
    echo "✅ SAFETY AUDIT PASSED! No credentials detected."
    echo "=================================================="
    exit 0
fi
