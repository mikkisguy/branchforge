---
title: Installation
---

# Installation

BranchForge is a full-stack application. You have two options to run it: Docker (recommended for trying it out) or local development with pnpm (recommended for contributing).

## Prerequisites

For either path, you will need:

- Node.js >= 24.0.0
- pnpm >= 9.0.0

For local development (pnpm path), you will also need:

- PostgreSQL 14+

## Quick Start with Docker (Recommended)

This is the fastest way to try BranchForge. Everything runs in containers — no local database setup required.

```bash
git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
cp .env.example .env
# Edit .env — set SESSION_SECRET and ENCRYPTION_KEY
docker compose up -d
```

::: tip
After editing `.env`, you can generate random secrets with:

```bash
openssl rand -hex 32  # Run twice for SESSION_SECRET and ENCRYPTION_KEY
```

:::

The application will be available at:

- Frontend: http://localhost (served via Nginx on port 80)
- Backend: http://localhost:3000
- PostgreSQL: Containerized (no direct access needed)

To view logs:

```bash
docker compose logs -f
```

To stop the application:

```bash
docker compose down
```

## Development with pnpm

Use this path if you are contributing to the project or need hot reload.

```bash
git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
pnpm install
cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY (32-byte hex)
```

::: warning
Make sure your PostgreSQL database is running and accessible via the `DATABASE_URL` you configure.
:::

Run database migrations:

```bash
pnpm --filter @branchforge/backend db:migrate
```

Start both frontend and backend in development mode:

```bash
pnpm dev
```

The application will be available at:

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

The Vite dev server automatically proxies `/api` requests to the backend.

## Which should I choose?

| Docker                       | pnpm                          |
| ---------------------------- | ----------------------------- |
| Production-like environment  | Hot reload for fast iteration |
| One command to start         | Required for contributing     |
| Self-contained (no local DB) | Requires local PostgreSQL     |
| Good for evaluation          | Good for development          |

## Next Steps

After installing BranchForge, head to [Your First Project](./projects) to create your first project.
