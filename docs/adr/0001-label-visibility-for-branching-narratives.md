# ADR-0001: Label Visibility for Branching Narratives

**Status:** Accepted

**Date:** 2025-05-07

## Context

Visual novels with branching narratives need to track which content (labels/scenes) appears in which routes. Common patterns include:

- **Shared content** — Opening/closing acts that all players see regardless of route
- **Exclusive content** — Route-specific scenes (confessions, romantic moments)
- **Duo content** — Scenes accessible only when pursuing two specific characters (e.g., duo endings based on love stat thresholds)

## Decision

Implement a three-tier label visibility model:

| Visibility    | Meaning                                           | Route field                       | Duo pair reference       |
| ------------- | ------------------------------------------------- | --------------------------------- | ------------------------ |
| **EXCLUSIVE** | Scene appears in exactly one route                | Set to route key (e.g., "eileen") | null                     |
| **SHARED**    | Scene appears in all routes                       | null                              | null                     |
| **DUO_PAIR**  | Scene accessible only via specific character pair | null                              | References `pair_groups` |

### Schema implementation

```typescript
// labels table
visibility: labelVisibilityEnum("visibility").default("EXCLUSIVE"),
route: text("route"), // Soft reference to route_configs.route_key
duoPairId: uuid("duo_pair_id").references(() => pairGroups.id),

// route_configs table (per-project route definitions)
routeKey: text("route_key").notNull(), // "hero", "villain" - unique per project
routeName: text("route_name").notNull(), // "Hero's Route" - display name
jumpPrefix: text("jump_prefix").notNull(), // "hero_" - for Ren'Py labels

// pair_groups table (duo endings with thresholds)
characterAId: uuid("character_a_id").notNull(),
characterBId: uuid("character_b_id").notNull(),
duoEndingLabel: text("duo_ending_label").notNull(),
threshold: integer("threshold").default(70), // Love stat requirement
```

## Consequences

### Positive

- **Accurate content tracking** — Can query which labels are shared vs route-specific for export/organization
- **Duo pair support** — Native support for duo endings with configurable thresholds
- **Flexible routing** — `route_configs` allows per-project route customization (not hardcoded)
- **Export consistency** — Jump prefixes (`hero_`, `villain_`) ensure proper Ren'Py label generation

### Negative

- **Query complexity** — Must consider visibility + route + duo pair when listing/filtering labels
- **Schema overhead** — Three tables involved (labels, route_configs, pair_groups)
- **Learning curve** — New contributors must understand the visibility model
- **Potential overkill** — For simple linear VNs, this complexity is unnecessary (but opt-out via default EXCLUSIVE)

### Alternatives considered

1. **Boolean `is_shared` flag** — Too simple, doesn't capture duo pairs
2. **JSON array of route keys** — Harder to query, no referential integrity
3. **Separate tables per visibility type** — Over-normalized, complex joins
4. **No tracking at all** — Lose ability to distinguish shared vs exclusive content

## References

- Schema: `apps/backend/src/db/schema/tables/labels.ts`
- Schema: `apps/backend/src/db/schema/tables/route-configs.ts`
- Schema: `apps/backend/src/db/schema/tables/pair-groups.ts`
