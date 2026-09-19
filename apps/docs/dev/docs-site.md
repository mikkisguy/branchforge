---
title: Docs Site
---

# Docs Site

The documentation app lives in `apps/docs` and is built with VitePress.

## Commands

```bash
pnpm docs:dev       # local dev server (syncs architecture first)
pnpm docs:build     # production build
pnpm docs:preview   # preview the production build
```

Package-scoped equivalents:

```bash
pnpm --filter @branchforge/docs dev
pnpm --filter @branchforge/docs build
pnpm --filter @branchforge/docs typecheck
```

## Site URL and canonical links

Set `VITEPRESS_SITE_URL` when building or deploying so canonical URLs, Open
Graph tags, and the sitemap use the correct hostname:

```bash
VITEPRESS_SITE_URL=https://docs.example.com pnpm docs:build
```

If `VITEPRESS_SITE_URL` is unset, the config falls back to Vercel environment
variables (`VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`), normalizing
protocol and trailing slashes. Local builds default to `http://localhost:5173`.

## Theme

The site extends the default VitePress theme under
`.vitepress/theme/`. The home page is a custom Vue component injected into the
default home layout slot (so the shared navbar and client-side routing stay
intact). All other pages use the standard documentation layout (nav, sidebar,
search, appearance toggle).

## Generated source pages

`apps/docs/scripts/sync-source-docs.js` copies `docs/ARCHITECTURE.md` into
`dev/architecture.md` and the root `CHANGELOG.md` into the user-facing
`/changelog` page before dev/build. Do not edit the generated files directly;
update their source documents instead.

## Demo data for screenshots

Seed a deterministic demo project for documentation and manual testing:

```bash
pnpm db:seed:docs-demo
```

Credentials (development only):

| Field    | Value                        |
| -------- | ---------------------------- |
| Email    | `docs-demo@branchforge.test` |
| Password | `docsdemo123`                |

The script refuses `production` and `staging` environments. Re-running rebuilds
only the dedicated demo user/project.

See `apps/docs/screenshot-checklist.md` for capture filenames and required UI
state.
