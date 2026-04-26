<div align="center">

# BranchForge

**A creative workspace for Ren'Py visual novel writers**

[![Version](https://img.shields.io/badge/version-0.7.0-yellow)](CHANGELOG.md)
![Alpha](https://img.shields.io/badge/status-alpha-orange)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

</div>

---

⚠️ BranchForge is currently in **alpha**. The app may contain bugs, incomplete features, and breaking changes. **Do not use it for production projects.** We welcome feedback, bug reports, and contributions!

## ✨ Why BranchForge?

BranchForge gives you a peaceful, focused writing environment that respects your creative flow.

- **Distraction-free Write Mode** - Dialogue flows without interruption
- **Script Mode** - Edit RPY files with real syntax highlighting
- **Characters come alive** - Manage characters, track relationships
- **See your paths** - Visual route management for branching narratives
- **GitLab sync** - Version control without the headache
- **Daily goals** - Build your writing habit

## 🌟 Features

### Write Mode

Enter the flow state. Write dialogue with auto-save and unlimited undo/redo. Just you and your story.

### Script Mode

When you need to code, we've got your back. Custom Ren'Py syntax highlighting with CodeMirror.

### Character Management

- Upload avatars (WebP conversion included)
- Auto-detect characters from GitLab files
- Tag dialogue with speakers

### Import & Export

- **Zip Import**: Bring in existing Ren'Py projects
- **GitLab Sync**: Collaborate with conflict detection
- **Export to GitLab**: Push your work directly to repositories

### Writer-Friendly Extras

- Daily writing goals with progress tracking

### Themes & Appearance

**Theme options:** Choose from four gorgeous color palettes - Forest, Periwinkle, Dark Amethyst, or Graphite

**Appearance modes:** Dark Mode available (Light Mode planned)

### Planned features

- **State Variables**: Simple boolean tracking for branching logic
- **Route Configuration**: Define custom story routes per project
- **Ren'Py Definitions**: Manage custom code definitions (CHARACTER, TRANSFORM, IMAGE, INIT)
- **Light Mode toggle**: Explicit light/dark mode switching (currently system-based)
- **Route Affiliations Tracking**

## 🏗️ Tech Stack

### Frontend

```
React 19       - Modern UI framework
TypeScript     - Type safety and better DX
Vite           - Lightning-fast dev server
TanStack Query - Intelligent server state
CodeMirror     - Ren'Py syntax highlighting
Tailwind CSS   - Beautiful, responsive design
Lucide React   - Clean, modern icons
React Router   - Client-side routing
```

### Backend

```
Fastify        - Fast, low-overhead web framework
TypeScript     - Full stack type safety
PostgreSQL     - Robust relational database
Drizzle ORM    - Type-safe database queries
Vitest         - Fast, modern testing
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
- PostgreSQL 14+

### Installation

```bash
# Clone and install
git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Prepare the database
pnpm --filter @branchforge/backend db:migrate

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
- [FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md) - What's being built
- [ACCESSIBILITY_ROADMAP.md](docs/ACCESSIBILITY_ROADMAP.md) - Accessibility improvements plan
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [DATABASE_SCHEMAS.md](docs/DATABASE_SCHEMAS.md) - Database structure

### Project Structure

```
branchforge/
├── apps/
│   ├── backend/          # Your API server
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/  # Business logic
│   │   │   └── db/       # Database & migrations
│   └── frontend/         # Your creative workspace
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── pages/       # Pages (Write Mode, Script Mode)
│       │   ├── hooks/       # Custom React hooks
│       │   └── api/         # API clients
├── packages/
│   └── shared/           # Shared types & utilities
├── docs/                 # Documentation
│   ├── FEATURE_ROADMAP.md
│   └── DATABASE_SCHEMAS.md
├── scripts/              # Utility scripts
├── CONTRIBUTING.md       # How to contribute
└── .impeccable.md       # Design philosophy
```

### Available Scripts

```bash
# Root commands
pnpm dev        # Start all apps
pnpm build      # Build everything
pnpm test       # Run all tests
pnpm lint       # Check code quality
pnpm format     # Format with prettier

# Backend
pnpm --filter @branchforge/backend dev          # Start backend
pnpm --filter @branchforge/backend test         # Run tests
pnpm --filter @branchforge/backend typecheck    # Type check
pnpm --filter @branchforge/backend db:migrate   # Run migrations
pnpm --filter @branchforge/backend db:studio   # Open database GUI

# Frontend
pnpm --filter @branchforge/frontend dev     # Start frontend
pnpm --filter @branchforge/frontend build   # Build for production
pnpm --filter @branchforge/frontend test    # Run tests
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

See [docs/FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md) for the full picture.

### Current Status (v0.7.0)

| Status                   | Progress           |
| ------------------------ | ------------------ |
| ✅ Fully Implemented     | 13/26 tables (50%) |
| 🟡 Partially Implemented | 8/26 tables (31%)  |
| ❌ Not Implemented       | 5/26 tables (19%)  |

### What's Coming?

**High Priority:**

- Zip file export (download your projects)
- Meter management (track relationships and stats)
- Label-Character relationships (associate characters with scenes)
- Beta reader sharing (get feedback on your story)

**Medium Priority:**

- Visual system configuration
- User settings UI (avatars, language, profile)
- World elements (locations, items, events)

**On the Drawing Board:**

- AI writing suggestions (OpenRouter integration)
- Pair group tracking (duo endings for sequels)
- Import from external sources

### Out of Scope

- Demo/Playback Mode: Focus is on authoring and managing content, not playback

## 🌍 Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

Starts PostgreSQL, backend, and frontend automatically. The frontend (port 80) serves static files and proxies `/api` requests to the backend (port 3000).

To run the frontend locally instead, use `pnpm dev` from `apps/frontend`.

### Manual Deployment

```bash
# Build for production
pnpm build

# Set environment
NODE_ENV=production
# ... configure other env vars

# Start backend
cd apps/backend
pnpm start

# Deploy frontend
# Upload apps/frontend/dist to your web server
```

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
