#!/bin/bash
set -euo pipefail

# Usage: ./scripts/backup.sh [output_file]
# Example: ./scripts/backup.sh backup-$(date +%Y%m%d%H%M%S).sqlite

OUTPUT_FILE=${1:-"backup-$(date +%Y%m%d%H%M%S).sqlite"}

# Load environment variables to get the database path
if [ -f ".env" ]; then
  export $(cat ".env" | xargs)
fi

DB_PATH=${SQLITE_DB_PATH:-"data/aegiscart.db"}

if [ ! -f "$DB_PATH" ]; then
  echo "Database file not found: $DB_PATH"
  exit 1
fi

echo "Backing up database from $DB_PATH to $OUTPUT_FILE"
cp "$DB_PATH" "$OUTPUT_FILE"

echo "Backup completed: $OUTPUT_FILE"