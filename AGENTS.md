# AGENTS.md

This file is the authoritative technical reference for agentic coding assistants.
It contains detailed implementation guidelines that should be followed exactly.

## Development Commands

```bash
# Start both frontend and backend (development)
pnpm dev

# Build all packages and apps
pnpm build

# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Lint backend and shared packages
pnpm lint

# Format all code
pnpm format

# Type check all packages
pnpm typecheck
```

### Running Single Tests

```bash
# Frontend test (vitest in watch mode)
cd apps/frontend
pnpm test path/to/test.test.ts

# Backend unit test
cd apps/backend
pnpm test:unit path/to/test.unit.test.ts

# Backend integration test
cd apps/backend
pnpm test:integration path/to/test.integration.test.ts
```

### Database Commands (Backend)

```bash
cd apps/backend

# Generate migration from schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Validate migrations
pnpm db:validate

# Open Drizzle Studio
pnpm db:studio
```

## Code Style Guidelines

### Imports

- All imports must use `.js` extensions (ES modules)
- Backend: Import from local files with relative paths: `import { thing } from "../service.js"`
- Frontend: Use `@/` alias for src: `import { thing } from "@/lib/thing"`
- Type-only imports: `import type { Thing } from "./file.js"`
- Order: external libs → workspace packages → local modules

### TypeScript

- Strict mode enabled
- Use `z.infer<schema>` for types from Zod schemas, never create duplicate interfaces
- Use TypeScript unions instead of `enum` keyword: `export type Role = "OWNER" | "READER"`
- Never use `as any` - create type guard functions instead
- Use Drizzle's `$inferSelect` and `$inferInsert` for database types

### Naming Conventions

- Files: kebab-case for utilities/services, PascalCase for components
- Functions: camelCase
- Classes/Interfaces: PascalCase
- Constants: Use UPPER_SNAKE_CASE for global values (API_BASE_URL, MAX_RETRIES, error codes). Use camelCase for config objects, theme values, and module-level defaults.
- Test files: `*.unit.test.ts`, `*.integration.test.ts`, `*.test.tsx`

### Formatting (Prettier)

- Semicolons: yes
- Quotes: double (never single)
- Trailing commas: es5
- Print width: 80
- Indent: 2 spaces (no tabs)
- Arrow parens: always
- End of line: lf

### Backend-Specific Guidelines

**Validation:** Use Zod schemas from `src/lib/validation.ts`. All routes should use `validateBody()`, `validateQuery()`, or `validateParams()` middleware.

**Error Handling:** Throw custom error classes from `src/middleware/error-handler.middleware.ts`:

- `ValidationError` (400)
- `NotFoundError` (404)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `ConflictError` (409)
- `RateLimitError` (429)

**Database:** NEVER write migrations by hand. Modify schema files in `src/db/schema/`, then run `pnpm db:generate` and `pnpm db:migrate`.

**Performance:** Use `Promise.all()` for parallel independent queries. Avoid N+1 patterns.

**Rate Limiting:** Required for auth endpoints, recommended for all public endpoints. Use `checkRateLimit()` from `src/services/rate-limiter.service.ts`.

**Security:** Return generic error messages to clients. Log detailed errors server-side. Never expose internal implementation details.

### Frontend-Specific Guidelines

**State Management:** Use TanStack Query (React Query v5) for all server state. Only use React Context for ThemeContext and ToastContext.

**Query Keys:** Define in `src/lib/query-keys.ts` with hierarchical structure.

**Custom Hooks:** Place in `src/hooks/`. Use TanStack Query mutations for writes, queries for reads.

**Components:** Use class-variance-authority for variants. Lucide React for icons.

**Testing:** Vitest + @testing-library/react. Setup file: `src/test/setup.ts`.

### Shared Types

All types shared between frontend and backend MUST be defined in `packages/shared/src/index.ts`. After changes, rebuild: `pnpm --filter @branchforge/shared build`.

### Database Migrations (CRITICAL)

NEVER create hand-written migration files. The only correct workflow:

1. Modify schema files in `apps/backend/src/db/schema/`
2. Run `pnpm --filter @branchforge/backend db:generate`
3. Review generated migration in `apps/backend/src/db/migrations/`
4. Apply with `pnpm --filter @branchforge/backend db:migrate`

Bypassing this breaks migration tracking and causes deployment failures.
