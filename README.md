<div align="center">

<img width="200" height="200" alt="branchforge_logo" src="https://github.com/user-attachments/assets/2ab6fd1f-4110-4568-adc3-dd272fdc34d4" />

# BranchForge

**A creative workspace for Ren'Py visual novel writers**

[![Version](https://img.shields.io/badge/version-0.13.0-yellow)](CHANGELOG.md)
![Alpha](https://img.shields.io/badge/status-alpha-orange)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

</div>

---


⚠️ BranchForge is currently in **alpha**. The app may contain bugs, incomplete features, and breaking changes. **Do not use it for production projects.** We welcome feedback, bug reports, and contributions!

## ✨ Why BranchForge?

BranchForge gives you a peaceful, focused writing environment that respects your creative flow. Start from an existing Ren'Py project (zip or GitLab); BranchForge does not create projects from scratch.

- **Distraction-free Write Mode** - Dialogue flows with autosave, undo/redo, and incoming jumps
- **Script Mode** - Edit RPY files with real Ren'Py syntax highlighting
- **Visual flow graph** - See your branching paths in FLOW, ROUTE, and FILE layouts
- **Characters come alive** - Manage characters, avatars, and dialogue linking
- **Variables & stats** - Boolean flags and numeric stat tracking for branching logic
- **Route configurations** - Define custom story routes per project
- **World bible & pair groups** - Track locations, items, events, and duo endings
- **GitLab sync** - Version control with conflict detection
- **Zip import/export** - Bring in existing Ren'Py projects or download your work
- **Daily writing goals** - Build your writing habit

## 🌟 Features

### Write Mode

Enter the flow state. Write dialogue with autosave, unlimited undo/redo, and metadata badges. Technical badges (conditions, stats, variables, visual statements) are display-only here; author them in Script Mode.

### Script Mode

When you need to code, we've got your back. CodeMirror 6 with custom Ren'Py syntax highlighting, search, font size, and line wrap toggles. This is where conditions, variables, stats, menus, jumps, and scene/show/hide commands are authored.

### Flow Graph

Visualize your branching narrative as a directed graph. Switch between FLOW (hierarchical), ROUTE (by route column), and FILE (by file column) layouts. Drag nodes to rearrange, filter by route, character, or status.

### Character Management

- Upload avatars (image processing via Sharp, with size/MIME validation)
- Auto-detect characters from RPY files
- Tag dialogue with speakers
- Pair groups for duo ending tracking

### World Bible

Track locations, items, concepts, and events per project.

### Variables & Stats

- **Variables**: Simple boolean tracking for branching logic
- **Stats**: Numeric stat tracking with min/max values, character or global scope, and per-label progression

### Import & Export

- **Zip Import**: Bring in existing Ren'Py projects (create new or merge into existing)
- **Zip Export**: Download your full project
- **GitLab Sync**: Pull RPY files from repos, push back, with conflict detection

### Writer-Friendly Extras

- Daily writing goals with progress tracking
- User settings (avatar, username, theme persistence)
- Per-project visual system configuration
- Focus mode toggle
- Collapsible sidebars
- Font family switching
- Mobile-responsive app shell (overflow menu, form and keyboard accessibility improvements)

### Themes & Appearance

**Theme palettes:** Choose from four color palettes - Forest, Periwinkle, Dark Amethyst, or Graphite

**Appearance modes:** Dark and light mode, with dark as the default

### Planned features

- **Ren'Py Definitions**: Import wizard for custom code definitions (CHARACTER, TRANSFORM, IMAGE, INIT)
- **Ren'Py Snippets**
- **Beta Reader Management**: Share projects and gather feedback
- **AI Writing Suggestions**: OpenRouter integration, with opt-in AI assistance for overcoming writer's block
- Remaining accessibility: tablet layouts, focus indicators, high contrast, reduced motion

## 🏗️ Tech Stack

### Frontend

```
React 19       - Modern UI framework
TypeScript     - Type safety and better DX
Vite 7         - Lightning-fast dev server
TanStack Query - Intelligent server state
CodeMirror 6   - Ren'Py syntax highlighting
React Flow     - Visual flow graph (@xyflow/react)
Tailwind CSS   - Beautiful, responsive design
shadcn-style UI - Custom component library
Lucide React   - Clean, modern icons
React Router 7 - Client-side routing
Recharts       - Charts and visualizations
```

### Backend

```text
Fastify 5      - Fast, low-overhead web framework
TypeScript     - Full stack type safety
PostgreSQL 18  - Robust relational database
Drizzle ORM    - Type-safe database queries
Zod            - Runtime validation
Session Auth   - HTTP-only cookies via @fastify/session
Sharp          - Image processing for avatars
JSZip          - Zip import/export
Vitest         - Fast, modern testing
```

### Shared

```text
Zod schemas    - Runtime validation shared with frontend
TypeScript     - Type-safe contracts across the stack
```

### Monorepo

```
pnpm workspaces - Efficient package management
changesets      - Semantic versioning
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 24.0.0
- pnpm >= 9.0.0
- PostgreSQL 18 (Docker Compose uses `postgres:18-alpine`)

### Installation

```bash
# Clone and install
git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
pnpm install

# Set up environment
cp .env.example .env
# Edit .env - required: SESSION_SECRET, ENCRYPTION_KEY (32-byte hex)

# Prepare the database (creates DBs if missing, then migrates main + test)
pnpm --filter @branchforge/backend db:bootstrap

# Start writing!
pnpm dev
```

Backend runs at `http://localhost:3000`, frontend at `http://localhost:5173`.

## 📖 Development

### Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [SUPPORT.md](SUPPORT.md) - Get help and FAQ
- [SECURITY.md](SECURITY.md) - Report vulnerabilities
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [DATABASE_SCHEMAS.md](docs/DATABASE_SCHEMAS.md) - Database structure
- [GitHub Issues](https://github.com/mikkisguy/branchforge/issues) - Remaining work (v1.0 tracker: [#141](https://github.com/mikkisguy/branchforge/issues/141))
- Docs site: `pnpm docs:dev` (VitePress in `apps/docs`)

### Project Structure

```
branchforge/
├── apps/
│   ├── backend/          # API server (Fastify)
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/  # Business logic
│   │   │   ├── middleware/  # Auth, validation, error handling
│   │   │   └── db/       # Schema, migrations, connection
│   ├── frontend/         # Creative workspace (React 19)
│   │   ├── src/
│   │   │   ├── components/  # UI components (write-mode, script-mode, flow, ui)
│   │   │   ├── pages/       # Pages (HomePageIDE, auth)
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # API client, query keys, utils
│   │   │   └── contexts/    # Theme and Toast contexts
│   └── docs/             # VitePress docs site
├── packages/
│   └── shared/           # Shared Zod schemas & TypeScript types
├── docs/                 # Documentation
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMAS.md
│   ├── DEPLOYMENT.md
│   ├── adr/              # Architecture decision records
│   ├── agents/           # Agent skill docs
│   └── features/         # Feature specs
├── scripts/              # Utility scripts
├── CONTRIBUTING.md       # How to contribute
└── AGENTS.md            # Agent instructions
```

### Available Scripts

```bash
# Root commands
pnpm dev        # Start all apps
pnpm build      # Build everything
pnpm test       # Run all tests (unit + integration)
pnpm test:unit  # Run unit tests only
pnpm test:integration  # Run integration tests only
pnpm lint       # Check code quality
pnpm format     # Format with prettier
pnpm typecheck  # Type check all packages
pnpm docs:dev   # VitePress docs site
pnpm docs:build # Build docs
pnpm docs:preview  # Preview built docs

# Backend
pnpm --filter @branchforge/backend dev          # Start backend
pnpm --filter @branchforge/backend test         # Run all backend tests
pnpm --filter @branchforge/backend test:unit    # Run backend unit tests
pnpm --filter @branchforge/backend test:integration  # Run backend integration tests
pnpm --filter @branchforge/backend typecheck    # Type check
pnpm --filter @branchforge/backend db:generate  # Generate migration from schema changes
pnpm --filter @branchforge/backend db:migrate   # Run migrations
pnpm --filter @branchforge/backend db:validate  # Validate migrations
pnpm --filter @branchforge/backend db:studio   # Open database GUI
pnpm --filter @branchforge/backend db:backup   # Backup database
pnpm --filter @branchforge/backend db:restore  # Restore database

# Frontend
pnpm --filter @branchforge/frontend dev     # Start frontend
pnpm --filter @branchforge/frontend build   # Build for production
pnpm --filter @branchforge/frontend test    # Run frontend tests
pnpm --filter @branchforge/frontend typecheck  # Type check

# Shared
pnpm --filter @branchforge/shared build   # Build shared types (run after changes)
```

### Database Management

```bash
# Generate migration from schema changes
pnpm --filter @branchforge/backend db:generate

# Run migrations
pnpm --filter @branchforge/backend db:migrate

# Open Drizzle Studio (database GUI)
pnpm --filter @branchforge/backend db:studio

# Backup & restore
pnpm --filter @branchforge/backend db:backup
pnpm --filter @branchforge/backend db:restore
```

## 🛤️ Roadmap

The v1.0 roadmap is tracked in [GitHub issue #141](https://github.com/mikkisguy/branchforge/issues/141) — that's the single source of truth for what's done, in progress, and queued. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design.

Shipped through **v0.13.0** includes the core writing workflow, flow graph, zip/GitLab import, world bible, pair groups, visual system config, user settings, dark/light themes, and mobile/accessibility improvements (responsive shell, keyboard nav, screen reader support, form a11y, contrast). Remaining work is in GitHub Issues; highlights:

- Flow graph performance and hover tooltips
- Prose editor text formatting
- Narrator character marking
- Ren'Py definitions import wizard and snippets
- Beta reader management
- AI writing suggestions (OpenRouter)
- Tablet layouts, focus indicators, high contrast, reduced motion
- Keyboard shortcuts documentation

## 🌍 Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

Starts PostgreSQL (18), backend, and frontend automatically. Frontend serves on port 80 via Nginx and proxies `/api` requests to the backend on port 3000.

To run the frontend locally instead, use `pnpm dev` from `apps/frontend`.

### Manual Deployment

```bash
# Build for production
pnpm build

# Set environment
NODE_ENV=production
# ... configure other env vars (SESSION_SECRET, ENCRYPTION_KEY, DATABASE_URL, ...)

# Start backend
pnpm start

# Deploy frontend
# Upload apps/frontend/dist to your web server (Nginx config in apps/frontend/nginx.conf)
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete guide.

## 🤝 Contributing

Small, focused contributions are welcome! This is a personal project, so we keep it manageable.

[**Read CONTRIBUTING.md →**](CONTRIBUTING.md)

**Quick summary:**

- Open an issue before starting work
- Small fixes and improvements are most welcome
- Large features need discussion first
- Keep PRs focused and well-documented

## 💭 Design Philosophy

BranchForge is built to be **inspiring, gentle, and efficient**.

The interface feels like a quiet, welcoming creative space—not a harsh technical tool. Every interaction is smooth and considered. The polish builds confidence without being flashy.

- **Inspiring**: The UI encourages creativity and flow
- **Gentle**: Approachable, calm, never overwhelming
- **Efficient**: Respect the writer's time with thoughtful shortcuts
- **Polished**: Every detail considered, nothing half-baked

[Read the full design context →](.impeccable.md)

## 📄 License

GPL v3.0 - See [LICENSE](LICENSE) for details.

## 💬 Support

- **Found a bug or have an idea?** [Open an issue!](https://github.com/mikkisguy/branchforge/issues)
  - Use our [bug report template](https://github.com/mikkisguy/branchforge/issues/new?template=bug_report.md)
  - Use our [feature request template](https://github.com/mikkisguy/branchforge/issues/new?template=feature_request.md)
- **Need help?** Check [SUPPORT.md](SUPPORT.md) for FAQ and community resources
- **Security issue?** See [SECURITY.md](SECURITY.md) for responsible disclosure
- **Documentation:** Check the [docs/](docs/) folder
- **Like the project?** Star it on GitHub! ⭐

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a history of changes.

---

<div align="center">

**Made with ❤️ for visual novel writers**

### Check out Ren'Py!

[<img width="130" height="200" alt="image" src="https://github.com/user-attachments/assets/3d9cda19-492f-4486-9e24-264eadd20d1d" />
](https://www.renpy.org/)

</div>
