# Meter Management — Design Spec

**Issue:** [#13](https://github.com/mikkisguy/branchforge/issues/13)
**Date:** 2026-05-21
**Status:** Design

## Overview

Meters are numerical relationship stats (affection, trust, etc.) tracked across visual novel scenes. This feature implements full CRUD for defining meters and a progression view showing which labels affect each meter.

## Architecture

```
packages/shared/src/index.ts
  └── Meter, MeterProgression types

apps/backend/
  ├── src/services/meters.service.ts     # CRUD + progression query
  ├── src/routes/meters.routes.ts        # HTTP handlers
  ├── src/lib/validation.ts              # Zod schemas (+ meterIdParamsSchema etc.)
  └── src/server.ts                      # Route registration

apps/frontend/
  ├── src/lib/api/meters.ts              # API client
  ├── src/hooks/useMeters.ts             # TanStack Query hook
  ├── src/components/MetersDialog.tsx     # Master-detail dialog
  ├── src/components/MetersContent.tsx    # Left panel (meter list + CRUD)
  ├── src/components/MeterProgression.tsx # Right panel (progression detail)
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

Meters are referenced in labels via JSONB:

```typescript
// labels.prerequisites
{ meters?: Record<string, number> }  // e.g., { affection_luna: 50 }

// labels.effects
{ meters?: Record<string, number> }  // e.g., { affection_luna: 10 }
```

### New: Shared Types

```typescript
// packages/shared/src/index.ts
export interface Meter {
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

export interface MeterProgression {
  meterKey: string;
  meterName: string;
  minValue: number;
  maxValue: number;
  labels: MeterLabelEffect[];
}

export interface MeterLabelEffect {
  labelId: string;
  labelTitle: string;
  routeKey: string | null;
  prerequisiteValue: number | null;  // threshold: "show this scene if meter >= X"
  effectDelta: number | null;        // change: "meter += X"
}
```

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/:projectId/meters` | List all meters for project |
| POST | `/projects/:projectId/meters` | Create a meter |
| PUT | `/meters/:meterId` | Update a meter |
| DELETE | `/meters/:meterId` | Delete a meter |
| GET | `/projects/:projectId/meters/progression` | Get progression data for all meters |

### Authentication

All routes require `authenticate` middleware. All operations require project ownership (OWNER role).

### Progression endpoint

`GET /projects/:projectId/meters/progression` returns `MeterProgression[]`.

Implementation:
1. Fetch meters for the project
2. Fetch all active labels for the project (select id, title, route, prerequisites, effects)
3. For each meter, filter labels whose `prerequisites.meters` or `effects.meters` contain the meter's key
4. Build `MeterLabelEffect` entries with prerequisiteValue and effectDelta from the JSONB

## Validation Schemas

```typescript
export const createMeterSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, "Key must start with a letter and contain only lowercase letters, numbers, and underscores"),
  name: requiredString(200),
  characterId: uuidSchema.optional().nullable(),
  minValue: z.number().int().default(0),
  maxValue: z.number().int().default(100),
  description: optionalString(500),
}).strict().refine(data => data.minValue <= data.maxValue, {
  message: "Minimum value must be less than or equal to maximum value",
  path: ["minValue"],
});

export const updateMeterSchema = z.object({
  name: requiredString(200).optional(),
  characterId: uuidSchema.optional().nullable(),
  minValue: z.number().int().optional(),
  maxValue: z.number().int().optional(),
  description: optionalString(500),
}).strict().partial();

export const meterIdParamsSchema = z.object({ meterId: uuidSchema });
```

## Frontend UI

### MetersDialog

Master-detail layout:
- **Left panel (300px):** List of meters with add/edit/delete. Inline form for create/edit.
- **Right panel:** Progression view for the selected meter. Shows a table of labels that reference this meter.

States:
- **Loading:** Skeleton placeholders in both panels
- **Empty:** "No meters defined" with a create button and descriptive text
- **Error:** Toast notification + retry button
- **Selected:** Right panel shows progression data for the selected meter
- **No selection:** Right panel shows a prompt to select a meter

### Progression table columns

| Label | Route | Prerequisite | Effect |
|-------|-------|-------------|--------|
| "First Meeting" | luna_route | affection_luna >= 50 | +10 |
| "The Argument" | luna_route | — | -5 |
| "Reconciliation" | luna_route | affection_luna >= 60 | +20 |

## Service Implementation

### MetersService class

Follows the same pattern as `CharactersService`:

- `requireMeterAccess(meterId, userId)` — fetches meter + verifies project ownership
- `listMeters(projectId, userId)` — returns all meters for project
- `createMeter(projectId, userId, input)` — inserts with unique key check
- `updateMeter(meterId, userId, input)` — updates, validates min ≤ max
- `deleteMeter(meterId, userId)` — deletes
- `getProgression(projectId, userId)` — queries labels, extracts meter refs

### Error handling

- `NotFoundError("Meter")` — meter doesn't exist
- `ConflictError("Meter with this key already exists")` — unique key violation
- `ValidationError("minValue must be <= maxValue")` — business rule
- `ForbiddenError` — handled by `requireProjectOwnership`

## Query Keys

```typescript
export const meterKeys = {
  all: ["meters"] as const,
  lists: (projectId: string) => ["meters", projectId, "list"] as const,
  detail: (meterId: string) => ["meters", "detail", meterId] as const,
  progression: (projectId: string) => ["meters", projectId, "progression"] as const,
} as const;
```

## Implementation Order

1. **Shared types** — `Meter`, `MeterProgression`, `MeterLabelEffect`
2. **Backend validation** — Zod schemas
3. **Backend service** — `MetersService` with CRUD + progression
4. **Backend routes** — register on Fastify
5. **Frontend query keys** — `meterKeys`
6. **Frontend API client** — `metersApi`
7. **Frontend hook** — `useMeters`
8. **Frontend UI** — `MetersDialog`, `MetersContent`, `MeterProgression`
9. **Integration** — wire dialog into project UI (same pattern as state variables)
10. **Tests** — backend unit/integration, frontend unit

## Non-Goals

- Running total calculation across routes (v2)
- Meter visualization as a chart/graph (v2)
- Integration with label edit dialog to suggest meter effects (v2)
- `maxMeterDelta` enforcement from project settings (v2)
