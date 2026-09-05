# Backup and Disaster Recovery Procedures

## Overview

This document outlines the procedures for backing up and restoring the AegisCart application, focusing on the SQLite database which contains the majority of the application data.

## Backup Procedures

### Database Backup

The application uses a SQLite database located at the path specified by the `SQLITE_DB_PATH` environment variable (default: `data/aegiscart.db`).

To backup the database, you can use the provided backup script:

```bash
./scripts/backup.sh [backup-file-name]
```

If no backup file name is provided, the script will generate a filename with a timestamp, e.g., `backup-20230101120000.sqlite`.

The script will:
1. Load the environment variables from `.env` (or `.env.<environment>` if specified)
2. Copy the database file to the specified backup location

### Example

```bash
# Backup to a specific file
./scripts/backup.sh production-backup-$(date +%Y%m%d).sqlite

# Backup with automatic timestamp
./scripts/backup.sh
```

### File System Backup

In addition to the database, you may want to backup other important files such as:
- Logs (if stored outside the database)
- Configuration files (excluding secrets)
- Custom scripts or extensions

These can be backed up using standard file copy or archiving tools.

## Disaster Recovery Procedures

### Database Restoration

To restore the database from a backup, use the provided restore script:

```bash
./scripts/restore.sh <backup-file>
```

The script will:
1. Load the environment variables to determine the database path
2. Stop the application (if running via docker-compose)
3. Copy the backup file to the database location
4. Prompt for confirmation before overwriting the current database

### Example

```bash
./scripts/restore.sh backup-20230101120000.sqlite
```

### Full System Recovery

In the event of a complete system failure, follow these steps:

1. **Provision a new environment**: Set up a new server or virtual machine with the same operating system and dependencies.
2. **Restore the application code**: Checkout the application code from the version control repository (Git).
3. **Restore the database**: Use the restore script as described above.
4. **Restore configuration**: Ensure that the environment files (`.env`, `.env.staging`, `.env.production`) are restored with the correct values. Secrets should be restored from a secure backup.
5. **Reinstall dependencies**: Run `npm ci` to install the application dependencies.
6. **Start the application**: Use `npm start` or `docker-compose up -d` to start the application.

## Prevention and Mitigation

### Regular Backups

Schedule regular backups of the database using a cron job or similar mechanism. For example, to backup the database daily at 2 AM:

```bash
0 2 * * * /path/to/aegiscart/scripts/backup.sh /path/to/backups/db-backup-$(date +\%Y\%m\%d).sqlite
```

### Backup Storage

Store backups in a secure, offsite location. Consider using cloud storage services (e.g., AWS S3, Google Cloud Storage) with appropriate access controls and encryption.

### Testing Restores

Regularly test your backup and restore procedures to ensure that they work as expected. Perform a restore to a test environment and verify that the application functions correctly.

### Monitoring

Implement monitoring for backup success/failure and set up alerts for any failures.

## Additional Considerations

### Secrets Management

Ensure that secrets (such as API keys and signing secrets) are stored securely and are included in your backup strategy. Consider using a secrets management tool (e.g., HashiCorp Vault, AWS Secrets Manager) and including those backups in your disaster recovery plan.

### Application Logs

Depending on your logging configuration, application logs may be stored in files or sent to an external system. Ensure that logs are backed up if they are stored locally and are important for auditing or troubleshooting.

### Database Schema Changes

If the database schema changes in the future, ensure that your backup and restore procedures are compatible. The restore script simply copies the database file, so it will work as long as the backup was taken with a compatible schema version.

## Contact

For questions or assistance with backup and disaster recovery procedures, please contact the platform team.