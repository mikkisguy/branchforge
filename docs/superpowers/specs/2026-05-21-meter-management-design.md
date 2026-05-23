# Stat Management — Design Spec

**Issue:** [#13](https://github.com/mikkisguy/branchforge/issues/13)
**Date:** 2026-05-21
**Status:** Design

## Overview

Stats are numerical relationship stats (affection, trust, etc.) tracked across visual novel scenes. This feature implements full CRUD for defining meters and a progression view showing which labels affect each stat.

## Architecture

```
packages/shared/src/index.ts
  └── Stat, StatProgression types

apps/backend/
  ├── src/services/meters.service.ts     # CRUD + progression query
  ├── src/routes/meters.routes.ts        # HTTP handlers
  ├── src/lib/validation.ts              # Zod schemas (+ meterIdParamsSchema etc.)
  └── src/server.ts                      # Route registration

apps/frontend/
  ├── src/lib/api/meters.ts              # API client
  ├── src/hooks/useStats.ts             # TanStack Query hook
  ├── src/components/StatsDialog.tsx     # Master-detail dialog
  ├── src/components/StatsContent.tsx    # Left panel (stat list + CRUD)
  ├── src/components/StatProgression.tsx # Right panel (progression detail)
  └── src/lib/query-keys.ts              # meterKeys
```

## Data Model

### Existing (no schema changes needed)

```typescript
// meters table
{
  id: string;           // UUID PK
  projectId: string;    // FK → projects
  characterId: string?; // FK → characters (optional)
  key: string;          // unique per project (e.g., "affection_luna")
  name: string;         // display name (e.g., "Luna Affection")
  minValue: number;     // default 0
  maxValue: number;     // default 100
  description: string?;
  createdAt: string;
  updatedAt: string;
}
```

Stats are referenced in labels via JSONB:

```typescript
// labels.prerequisites
{ meters?: Record<string, number> }  // e.g., { affection_luna: 50 }

// labels.effects
{ meters?: Record<string, number> }  // e.g., { affection_luna: 10 }
```

### New: Shared Types

```typescript
// packages/shared/src/index.ts
export interface Stat {
  id: string;
  projectId: string;
  characterId: string | null;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatProgression {
  meterKey: string;
  meterName: string;
  minValue: number;
  maxValue: number;
  labels: StatLabelEffect[];
}

export interface StatLabelEffect {
  labelId: string;
  labelTitle: string;
  routeKey: string | null;
  prerequisiteValue: number | null; // threshold: "show this scene if stat >= X"
  effectDelta: number | null; // change: "stat += X"
}
```

## API Routes

| Method | Path                                      | Purpose                             |
| ------ | ----------------------------------------- | ----------------------------------- |
| GET    | `/projects/:projectId/meters`             | List all meters for project         |
| POST   | `/projects/:projectId/meters`             | Create a stat                       |
| PUT    | `/meters/:meterId`                        | Update a stat                       |
| DELETE | `/meters/:meterId`                        | Delete a stat                       |
| GET    | `/projects/:projectId/meters/progression` | Get progression data for all meters |

### Authentication

All routes require `authenticate` middleware. All operations require project ownership (OWNER role).

### Progression endpoint

`GET /projects/:projectId/meters/progression` returns `StatProgression[]`.

Implementation:

1. Fetch meters for the project
2. Fetch all active labels for the project (select id, title, route, prerequisites, effects)
3. For each stat, filter labels whose `prerequisites.meters` or `effects.meters` contain the stat's key
4. Build `StatLabelEffect` entries with prerequisiteValue and effectDelta from the JSONB

## Validation Schemas

```typescript
export const createStatSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Key must start with a letter and contain only lowercase letters, numbers, and underscores"
      ),
    name: requiredString(200),
    characterId: uuidSchema.optional().nullable(),
    minValue: z.number().int().default(0),
    maxValue: z.number().int().default(100),
    description: optionalString(500),
  })
  .strict()
  .refine((data) => data.minValue <= data.maxValue, {
    message: "Minimum value must be less than or equal to maximum value",
    path: ["minValue"],
  });

export const updateStatSchema = z
  .object({
    name: requiredString(200).optional(),
    characterId: uuidSchema.optional().nullable(),
    minValue: z.number().int().optional(),
    maxValue: z.number().int().optional(),
    description: optionalString(500),
  })
  .strict()
  .partial();

export const meterIdParamsSchema = z.object({ meterId: uuidSchema });
```

## Frontend UI

### StatsDialog

Master-detail layout:

- **Left panel (300px):** List of meters with add/edit/delete. Inline form for create/edit.
- **Right panel:** Progression view for the selected stat. Shows a table of labels that reference this stat.

States:

- **Loading:** Skeleton placeholders in both panels
- **Empty:** "No meters defined" with a create button and descriptive text
- **Error:** Toast notification + retry button
- **Selected:** Right panel shows progression data for the selected stat
- **No selection:** Right panel shows a prompt to select a stat

### Progression table columns

| Label            | Route      | Prerequisite         | Effect |
| ---------------- | ---------- | -------------------- | ------ |
| "First Meeting"  | luna_route | affection_luna >= 50 | +10    |
| "The Argument"   | luna_route | —                    | -5     |
| "Reconciliation" | luna_route | affection_luna >= 60 | +20    |

## Service Implementation

### StatsService class

Follows the same pattern as `CharactersService`:

- `requireStatAccess(meterId, userId)` — fetches stat + verifies project ownership
- `listStats(projectId, userId)` — returns all meters for project
- `createStat(projectId, userId, input)` — inserts with unique key check
- `updateStat(meterId, userId, input)` — updates, validates min ≤ max
- `deleteStat(meterId, userId)` — deletes
- `getProgression(projectId, userId)` — queries labels, extracts stat refs

### Error handling

- `NotFoundError("Stat")` — stat doesn't exist
- `ConflictError("Stat with this key already exists")` — unique key violation
- `ValidationError("minValue must be <= maxValue")` — business rule
- `ForbiddenError` — handled by `requireProjectOwnership`

## Query Keys

```typescript
export const meterKeys = {
  all: ["meters"] as const,
  lists: (projectId: string) => ["meters", projectId, "list"] as const,
  detail: (meterId: string) => ["meters", "detail", meterId] as const,
  progression: (projectId: string) =>
    ["meters", projectId, "progression"] as const,
} as const;
```

## Implementation Order

1. **Shared types** — `Stat`, `StatProgression`, `StatLabelEffect`
2. **Backend validation** — Zod schemas
3. **Backend service** — `StatsService` with CRUD + progression
4. **Backend routes** — register on Fastify
5. **Frontend query keys** — `meterKeys`
6. **Frontend API client** — `metersApi`
7. **Frontend hook** — `useStats`
8. **Frontend UI** — `StatsDialog`, `StatsContent`, `StatProgression`
9. **Integration** — wire dialog into project UI (same pattern as variables)
10. **Tests** — backend unit/integration, frontend unit

## Non-Goals

- Running total calculation across routes (v2)
- Stat visualization as a chart/graph (v2)
- Integration with label edit dialog to suggest stat effects (v2)
- `maxStatDelta` enforcement from project settings (v2)
