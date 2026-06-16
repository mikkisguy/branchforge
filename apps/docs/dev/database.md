---
title: Database
---

# Database

BranchForge uses PostgreSQL 16 with Drizzle ORM.

## Overview

- **Database**: PostgreSQL 16
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

## Full Schema Reference

For detailed column definitions and relationships, see [docs/DATABASE_SCHEMAS.md](https://github.com/mikkisguy/branchforge/blob/main/docs/DATABASE_SCHEMAS.md) in the repository root.
