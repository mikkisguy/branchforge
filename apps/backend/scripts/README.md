# Database Backup & Restore Scripts

Quick and easy database snapshot/restore tools for development.

## Usage

### Create a backup

```bash
cd apps/backend
pnpm db:backup
```

This creates a timestamped backup file in `apps/backups/`.

You can also specify a custom filename:

```bash
pnpm db:backup my-custom-backup.sql
```

### List all backups

```bash
cd apps/backend
pnpm db:list
```

Shows all available backups with their size and modification date.

### Restore from a backup

```bash
cd apps/backend
pnpm db:restore <filename>
```

Example:

```bash
pnpm db:restore backup-2025-01-15T10-30-00-000Z.sql
```

**WARNING:** This will DELETE all existing data and replace it with the backup!

## How it works

- **Backup script** (`db-backup.ts`):

  - Connects to the database using the `DATABASE_URL` from your `.env`
  - Exports all table data as SQL INSERT statements
  - Saves to timestamped file in `apps/backups/`

- **Restore script** (`db-restore.ts`):
  - Reads the SQL backup file
  - Requires manual confirmation ("yes") before proceeding
  - Executes the SQL to restore all data
  - Uses transactions to ensure atomic restore

## Files

- `scripts/db-backup.ts` - Creates database snapshots
- `scripts/db-restore.ts` - Restores from snapshots
- `scripts/db-list.ts` - Lists available backups
- `apps/backups/` - Directory where backups are stored

## Notes

- Backups store **data only**, not schema (use migrations for schema changes)
- The backup directory is gitignored (except for `.gitkeep`)
- Backups use PostgreSQL-compatible SQL INSERT statements
