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

### Security Scanning (CodeQL)

**Policy:** When fixing a CodeQL / code-scanning alert (taint-flow queries like `request-forgery`, `sql-injection`, `prototype-pollution`, etc.), **verify the fix with the local CodeQL analyzer** before claiming success. Do not reason about what the analyzer models as a sanitizer/sink — run the query and get ground truth. For ordinary bugs, lint, typecheck, or feature work, use `pnpm test`/`typecheck`/`lint` instead — CodeQL is heavy (~30 s DB build + query eval) and wasteful for non-CodeQL problems.

**Usage:**

```bash
# Default: run js/request-forgery query
./scripts/codeql-scan.sh

# Explicit rule alias
./scripts/codeql-scan.sh request-forgery

# Full javascript-code-scanning suite (87 queries, what GitHub Actions runs)
./scripts/codeql-scan.sh full

# Arbitrary query/suite file
./scripts/codeql-scan.sh path/to/Query.ql
```

**Exit codes:** `0` = no alerts (clean) · `2` = alerts found · `1` = setup/usage error.

**Bootstrap install** (one-time, if `~/.local/share/codeql-cli/codeql` is missing):

```bash
mkdir -p ~/.local/share/codeql-cli
curl -sL -o /tmp/codeql.tar.gz \
  https://github.com/github/codeql-action/releases/latest/download/codeql-bundle-linux64.tar.gz
tar xzf /tmp/codeql.tar.gz -C ~/.local/share/codeql-cli
# -> creates ~/.local/share/codeql-cli/codeql/codeql
```

The script prints these instructions automatically if the CLI is absent.

## Code Style Guidelines

### Imports

- Backend: All imports must use `.js` extensions (ES modules)
- Backend: Import from local files with relative paths: `import { thing } from "../service.js"`
- Frontend: Use `@/` alias for src: `import { thing } from "@/lib/thing"`
- Type-only imports: Backend: `import type { Thing } from "./file.js"`
- Type-only imports: Frontend: `import type { Thing } from "./file"`

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

## Review Checklist

Before opening a PR, walk through this checklist. It is intentionally
short — the goal is "did I think about the obvious things", not exhaustive
review (that is the deterministic chain in `pnpm verify` and, for
sensitive changes, the `@oracle` review pass described in the Pull
Request Workflow below).

**Scope and shape**

- The diff is scoped to one issue. If scope grew, split it into a
  follow-up instead of mixing.
- No commented-out code, debug `console.log`s, or `TODO` left behind.

**Correctness**

- New behavior has at least one test. Bug fixes include a regression
  test that fails before the fix.

**Docs**

- `AGENTS.md` updated if a new convention, command, or workflow
  step was introduced.

## Pull Request Workflow

**Default flow for triaged issues: start on a fresh branch from `main`.**
When you begin work on a triaged issue, do not commit on whatever
branch is currently checked out. Instead:

1. `git checkout main`
2. `git pull origin main` (or `git pull` if `main` already tracks
   `origin/main`)
3. Create a branch named after the issue, e.g. `<#>-<slug>`
   (e.g. `123-rate-limit-auth`).
4. Implement the issue on that branch.

**Exception: in-place fixes on an existing PR.** If a PR is already
open for the work — including subsequent review iterations on the
same issue (checklist fixes, `@oracle` findings, CI failures) — push
to the same branch and PR. "Scope discipline" means "do not mix
unrelated changes into a PR" — it does not mean "always split
ad-hoc fixes into a new branch and PR." Only create a new branch
and PR when the developer explicitly says so, or when the work is
for a separate, distinct issue that has been triaged in the issue
tracker.

When the issue assigned to you is implemented and locally verified
(`pnpm verify` is green), take the work through to a PR that is green
and ready for human review. Use the `gh` CLI for all GitHub
interactions. **Never merge the PR yourself — merging is a developer
decision.**

**Flow:**

1. **Self-review with the checklist above.** Walk through
   `## Review Checklist`. Fix anything you find before committing.
2. **Sensitive or high-risk diffs: delegate to `@oracle` before
   opening the PR.** Use the `@oracle` specialist for a strategic +
   security review pass if **any** of the following is true:
   - The diff touches auth, sessions, rate limiting, secrets, or
     security boundaries.
   - The diff touches the database layer (schema, migrations,
     query helpers, audit log).
   - The diff adds or changes an API route, route handler, or
     middleware.
   - The diff is large (rule of thumb: > 200 changed lines, or any
     single file > 100 changed lines).
   - You are uncertain about an architectural choice.

   Documentation-only changes (typo fixes, formatting, doc rewording
   with no security or architectural impact) are exempt from the size
   and category triggers above — only route to `@oracle` if the doc
   change is itself a security/architectural decision.

   Pass to `@oracle`: the issue reference, the full diff, the list of
   files touched, and a one-line description of intent. Address every
   `must-fix` and `should-fix` finding on the branch, then re-delegate
   to `@oracle` with the updated diff. **Loop until `@oracle` reports
   no remaining must-fix or should-fix findings** — only then proceed
   to open the PR. Any item you intentionally defer must be called
   out in the PR body with a one-line justification; silently skipping
   a finding is not acceptable.

3. **Stage and commit** only the intended files. Inspect `git status`
   and `git diff` first; never commit secrets. Write a concise commit
   message that matches the repo style (look at recent
   `git log --oneline -10`).
4. **Push** the branch: `git push -u origin <branch>`.
5. **Open a PR** with `gh`:
   ```bash
   gh pr create \
     --base <base-branch> \
     --title "<short summary>" \
     --body "<issue reference + what changed + how it was verified + @oracle verdict if applicable>"
   ```
   Reference the issue (`Closes #N` or `Fixes #N`) in the body so
   merging the PR closes the issue.
6. **Watch status checks**: `gh pr checks --watch` (or poll with
   `gh pr view <pr> --json statusCheckRollup`). If a check fails, read
   the logs, fix the underlying cause on the branch, commit, push, and
   re-watch. Keep iterating until all required checks are green.

   **Exception for CodeRabbit:** Do not wait for CodeRabbit to complete (green or red).
   Fix all other required checks to green. It is fine to proceed when all other
   required checks are green and CodeRabbit is still running. The developer will
   follow up on CodeRabbit separately.

7. **Stop and hand off** when checks are green (except CodeRabbit). Do not run
   `gh pr merge`, do not enable auto-merge, do not dismiss reviews. The
   developer reviews and merges.

**Constraints:**

- One PR per issue, scoped tightly. If scope grows, split it into a
  follow-up.
- If a check looks flaky or transient, rerun it
  (`gh pr checks <id> --rerun`) only after confirming the failure is
  not caused by your change.
- Do not force-push after a review has started unless explicitly asked.
- If you are blocked by something only a human can resolve (missing
  credentials, protected-branch permissions, ambiguous requirements),
  stop and report the blocker instead of guessing.

## Agent skills

### Issue tracker

Issues live in the repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses default triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: reads from `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
