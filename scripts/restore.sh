#!/bin/bash
set -euo pipefail

# Usage: ./scripts/restore.sh <backup_file>
# Example: ./scripts/restore.sh backup-20230101120000.sqlite

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

BACKUP_FILE=$1

# Load environment variables to get the database path
if [ -f ".env" ]; then
  export $(cat ".env" | xargs)
fi

DB_PATH=${SQLITE_DB_PATH:-"data/aegiscart.db"}

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will overwrite the current database at $DB_PATH"
echo -n "Are you sure you want to restore from $BACKUP_FILE? (y/N) "
read -r CONFIRMATION

if [[ ! "$CONFIRMATION" =~ ^[Yy]$ ]]; then
  echo "Restore cancelled"
  exit 0
fi

echo "Stopping the application (if running via docker-compose)..."
docker-compose down || true

echo "Restoring database from $BACKUP_FILE to $DB_PATH"
cp "$BACKUP_FILE" "$DB_PATH"

echo "Restore completed. You can now start the application again."