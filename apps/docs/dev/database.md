---
title: Database
---

# Database

BranchForge uses PostgreSQL 18 with Drizzle ORM.

## Overview

- **Database**: PostgreSQL 18 (`postgres:18-alpine` in Docker Compose)
- **ORM**: Drizzle ORM (TypeScript-based)
- **Migrations**: Auto-generated from schema files

::: warning
Never write migrations by hand. See [Contributing](./contributing#database-changes) for the correct workflow.
:::

## Main Tables

The database includes these core tables:

- **users**: User accounts and authentication
- **projects**: Narrative projects
- **labels**: Labels for flow graph nodes
- **label_lines**: Many-to-many relationship between labels and script lines
- **characters**: Character information
- **stats**: Numeric tracking variables
- **variables**: Boolean flags
- **route_configs**: Route definitions
- **project_files**: Imported RPY files
- **project_file_pending_operations**: One collapsed pending GitLab structural
  change per file (`CREATE`, `RENAME`, or `DELETE`)

`project_files` retains the current local path, last synced remote path and
per-file remote revision/content baseline, a last-pushed local content hash,
and an optional deletion tombstone. Active paths are unique case-insensitively
within a project; the legacy source/path key remains for GitLab import upserts.

## Full Schema Reference

For detailed column definitions and relationships, see [docs/DATABASE_SCHEMAS.md](https://github.com/mikkisguy/branchforge/blob/main/docs/DATABASE_SCHEMAS.md) in the repository root.
