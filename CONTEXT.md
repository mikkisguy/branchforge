# BranchForge Domain Context

## What BranchForge Is

BranchForge is a creative workspace for Ren'Py visual novel authors. It provides a distraction-free writing environment with visual flow graphs, character management, and GitLab sync. Users import existing Ren'Py projects (never create from scratch) and BranchForge parses the `.rpy` files into a structured, visual editing experience.

## Core Domain Language

### Label

A named section of a Ren'Py script (e.g., `label first_meeting:`). Labels are the atomic unit of story structure — each contains dialogue, narration, choices, and jumps. Equivalent to a "scene" or "function" in other contexts. Every label has a `labelNumber`, `sequenceOrder`, and belongs to a `projectFile`.

### Route

A user-defined path through the story (e.g., "hero", "villain", "shared"). Routes are not hardcoded — users define them per project via route configurations. Each route has a `routeKey`, `routeName`, `jumpPrefix`, and `sortOrder`.

### Label Visibility

How a label relates to routes:

- **EXCLUSIVE** — belongs to one route only
- **SHARED** — accessible from any route (center column in ROUTE layout)
- **DUO_PAIR** — specific to a pair or group

### Flow Graph

Visual representation of how labels connect via jumps and choices. Three layout modes:

- **FLOW** — hierarchical (dagre left-to-right), based on connections
- **ROUTE** — vertical columns by route key, shared labels in center
- **FILE** — vertical columns by source RPY file, ordered by `sequenceOrder`

### Stat

Numeric value tracked across the story (e.g., affection, trust, health). Has `minValue`/`maxValue` bounds. Can be character-scoped or global. Stats gate lines via conditions using comparison operators (`>=`, `<=`, `>`, `<`, `==`, `!=`).

### Variable

Boolean flag for branching logic (e.g., `met_villain = True`). Variables gate lines via conditions using operators (`==`, `!=`, `truthy`, `falsy`).

### Character

A speaking entity in the story. Has a name, display name, Ren'Py tag, color, and optional avatar. Auto-detected from RPY `define` statements on import, or created manually. Characters can be tagged as love interests and have route affiliations.

### Label Line

Individual line of content within a label. Content types:

- **DIALOGUE** — spoken by a character (has `speakerId`)
- **NARRATION** — descriptive text
- **CHOICE** — menu option that jumps to a target label
- **MENU** — choice block container
- **JUMP** — transition to another label
- **VISUAL** — scene/show/hide command

### Write Mode

Distraction-free prose editor for writing dialogue and narration. Technical badges (conditions, stats, variables, visual statements) are **display-only** here — they reflect the RPY source but cannot be edited from this mode.

### Script Mode

Raw RPY source editor (CodeMirror 6 with custom Ren'Py syntax highlighting). This is where all technical content is authored: conditions, variables, stats, scene/show/hide commands, menu choices, labels, and jumps. Changes here are re-parsed and badges update in Write Mode automatically.

### Technical Badge

Display-only metadata shown next to lines in Write Mode: stat conditions, variable conditions, visual statements (scene/show/hide), and label status (draft/review/final). Authoring happens in Script Mode.

### Project File

An RPY file tracked in the system. Has a `source` origin (`GITLAB` or `ZIP`), `fileType` (`STORY` or `SETTINGS`), and `contentHash` for change detection and idempotency.

### Incoming Jump

A connection from another label to the current label. Types: `MENU_CHOICE` (via a menu option) or `AUTOMATIC` (sequential flow). Includes optional conditions that gate the jump.

### Source Origin

Where project content originated: `GITLAB` (synced from a repository) or `ZIP` (imported from an archive).

### Branching Narrative

The core concept: stories that branch based on player choices, tracked via variables and stats, visualized via the flow graph. BranchForge's purpose is to make branching narratives manageable and visible.

## Project Lifecycle

Projects are created by **importing** existing Ren'Py projects (via ZIP or GitLab through Settings), not from scratch. A user must have a working Ren'Py project (initialized via the Ren'Py SDK/launcher) before importing into BranchForge. Import options: create a new project from the import, or merge into an existing one.

## Architecture at a Glance

Monorepo with three packages:

- **`apps/frontend`** — React 19 SPA (Write Mode, Script Mode, Flow Graph)
- **`apps/backend`** — Fastify REST API (PostgreSQL via Drizzle ORM)
- **`packages/shared`** — TypeScript types and Zod schemas (single source of truth for cross-stack contracts)
