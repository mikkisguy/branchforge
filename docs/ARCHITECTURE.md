# BranchForge Architecture

## High-Level Overview

BranchForge is a full-stack monorepo application designed for visual novel authors. It provides a distraction-free writing environment integrated with GitLab for version control.

```
┌─────────────┐         ┌─────────────┐
│   Browser   │◄──────►│   Backend   │
│ (React App)  │  API    │  (Fastify)   │
└─────────────┘         └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │ PostgreSQL  │
                        │  Database   │
                        └─────────────┘
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|-------------|----------|
| Frontend | React 19, TypeScript, Vite | User interface |
| State Management | TanStack Query v5 | Server state, caching |
| Backend | Fastify, TypeScript | REST API server |
| Database | PostgreSQL 14+ | Persistent storage |
| ORM | Drizzle ORM | Type-safe queries |
| Styling | Tailwind CSS | Utility-first CSS |
| Editor | CodeMirror 6 | Ren'Py syntax highlighting |
| Build | pnpm workspaces | Monorepo management |

## Project Structure

```
branchforge/
├── apps/
│   ├── backend/              # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/     # API route handlers (fastify routes)
│   │   │   ├── services/   # Business logic layer
│   │   │   ├── lib/        # Utilities, validation, middleware
│   │   │   └── db/         # Schema, migrations, connection
│   │   └── Dockerfile
│   └── frontend/            # React SPA
│       ├── src/
│       │   ├── components/  # Reusable UI components
│       │   ├── pages/       # Route-level components
│       │   ├── hooks/       # Custom React hooks
│       │   ├── lib/         # Utilities, API clients
│       │   └── styles/      # Global styles, theme
│       └── Dockerfile
├── packages/
│   └── shared/             # Shared types & utilities
└── docs/                   # Documentation
```

## Key Architectural Decisions

### 1. Monorepo with pnpm Workspaces
- **Why**: Shared types between frontend/backend, consistent dependency versions
- **Trade-off**: More complex builds, but better type safety across stack

### 2. Fastify over Express
- **Why**: Better performance, plugin ecosystem, built-in TypeScript support
- **Trade-off**: Smaller community than Express

### 3. TanStack Query (React Query v5)
- **Why**: Automatic caching, background updates, optimistic updates
- **Trade-off**: Additional learning curve for simple state

### 4. Drizzle ORM
- **Why**: Type-safe queries, minimal runtime, good TypeScript integration
- **Trade-off**: Fewer features than Prisma, but more control

### 5. Custom Ren'Py Syntax Highlighting
- **Why**: Better DX for visual novel writers (CodeMirror 6 + custom language mode)
- **Trade-off**: Requires maintenance for Ren'Py syntax updates

## Data Flow

### Authentication Flow
```
User → Frontend → POST /api/auth/login
                   → Validate credentials
                   → Create session (cookie)
                   → Return user data
```

### GitLab Sync Flow
```
User → Frontend → POST /api/gitlab/sync
                   → Fetch from GitLab API
                   → Parse RPY files
                   → Import dialogue lines
                   → Update database
                   → Invalidate queries
```

### Writing Flow
```
User → Frontend (Write Mode)
     → Auto-save (debounced, 500ms)
     → PUT /api/labels/:id/dialogue
     → Validate & update database
     → Invalidate label queries
```

## Database Schema Highlights

Core tables:
- `users`, `user_settings` - Authentication & preferences
- `projects`, `project_users` - Project management & sharing
- `labels`, `label_lines` - Dialogue management
- `characters` - Character management with avatars
- `renpy_definitions` - Custom Ren'Py code definitions
- `state_variables` - Boolean story state tracking
- `gitlab_repos` - GitLab integration

See [DATABASE_SCHEMAS.md](DATABASE_SCHEMAS.md) for complete schema.

## API Design Patterns

### RESTful Conventions
- `GET /api/resources` - List resources
- `POST /api/resources` - Create resource
- `GET /api/resources/:id` - Get single resource
- `PUT /api/resources/:id` - Update resource
- `DELETE /api/resources/:id` - Delete resource

### Error Handling
- **400**: Validation error (Zod schema failure)
- **401**: Unauthorized (missing/invalid session)
- **403**: Forbidden (insufficient permissions)
- **404**: Not found
- **409**: Conflict (duplicate, sync conflict)
- **429**: Rate limited
- **500**: Server error

### Rate Limiting
- Auth endpoints: Required (prevent brute force)
- Public endpoints: Recommended
- Implementation: In-memory, configurable per endpoint

## Frontend Patterns

### Query Keys (TanStack Query)
Defined in `src/lib/query-keys.ts` with hierarchical structure:
```typescript
['projects'] → ['projects', projectId] → ['labels', labelId]
```

### Custom Hooks
- `useProjects()` - Project CRUD operations
- `useLabels(projectId)` - Label management
- `useCharacters(projectId)` - Character management
- `useGitLab(projectId)` - GitLab sync operations

### Component Organization
- **Atomic components**: `Button`, `Input`, `Modal`
- **Feature components**: `LabelCard`, `CharacterDialog`, `GitLabSettings`
- **Layout components**: `Sidebar`, `Header`, `Layout`

## State Management Strategy

| State Type | Solution |
|-------------|-----------|
| Server state | TanStack Query (caching, invalidation) |
| UI state | React useState, useReducer |
| Global state | React Context (Theme, Toast) |
| Form state | Controlled components + Zod validation |

## Security Considerations

1. **Session-based auth**: HTTP-only cookies with secure flag in production
2. **Input validation**: Zod schemas on all routes
3. **SQL injection**: Prevented by Drizzle ORM parameterized queries
4. **XSS**: React auto-escapes, Content Security Policy recommended
5. **CSRF**: Same-site cookie attribute
6. **File uploads**: Type checking, size limits, virus scanning recommended

## Deployment Architecture

### Development
```
Frontend (Vite dev server) → http://localhost:5173
Backend (Fastify) → http://localhost:3000
PostgreSQL → localhost:5432
```

### Production (Docker)
```
┌─────────────────┐
│   Nginx/Proxy  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Frontend│ │Backend │
│(static)│ │(node)  │
└───────┘ └───┬───┘
              │
              ▼
         ┌───────┐
         │Postgres│
         └───────┘
```

## Performance Considerations

1. **Code splitting**: React.lazy() for route-based splitting
2. **Image optimization**: WebP conversion for avatars (200px max)
3. **Database indexing**: Indexed foreign keys and frequently queried columns
4. **Query optimization**: Use `Promise.all()` for parallel queries
5. **Caching**: TanStack Query with 5-minute stale time for most queries
6. **Bundle size**: Vite builds analyzed with `vite-bundle-visualizer`

## Testing Strategy

### Unit Tests
- Backend: Vitest, focused on services and business logic
- Frontend: Vitest + @testing-library/react, component testing

### Integration Tests
- Backend: Full API tests with test database (PostgreSQL)
- Database migrations tested on each schema change

### E2E Tests
- Not currently implemented (Planned: Playwright)

## Development Workflow

1. Modify code in appropriate `apps/` or `packages/` directory
2. If types changed: `pnpm --filter @branchforge/shared build`
3. Run tests: `pnpm test`
4. Lint: `pnpm lint`
5. Type check: `pnpm typecheck`
6. Format: `pnpm format`

## Future Architecture Considerations

- **WebSocket support**: For real-time collaboration (planned)
- **Microservices**: Consider splitting backend if grows (not planned)
- **File storage**: S3-compatible storage for production (currently local)
- **Queue system**: For background jobs (e.g., large imports) (planned)

## Resources

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Fastify Docs](https://fastify.dev/)
- [TanStack Query Docs](https://tanstack.com/query/latest)
- [CodeMirror 6 Docs](https://codemirror.net/)
