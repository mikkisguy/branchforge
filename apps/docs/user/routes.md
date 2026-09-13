---
title: Routes & Visibility
---

# Routes & Visibility

Routes are user-defined story paths (for example, a heroine route or a shared
common route). Each project configures its own routes; they are not global
presets.

## Route configurations

For each route you define:

- **Route key** — internal identifier used in the database and flow graph
- **Display name** — shown in the UI
- **Jump prefix** — Ren'Py label prefix convention for that route (for example `hero_`)

Configure routes from the project settings panel. Labels can then be assigned
to a route or left unassigned for shared content.

<!-- screenshot: routes-config.png — Routes settings with Elena + Marcus routes, dark theme, docs demo project -->

## Label visibility

Every label has a visibility mode:

| Visibility    | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| **EXCLUSIVE** | Belongs to one route column in ROUTE layout              |
| **SHARED**    | Appears in the center column — accessible from any route |
| **DUO_PAIR**  | Tied to a [pair group](./pair-groups) for duo endings    |

Visibility affects how the [flow graph](./flow-graph) arranges nodes in ROUTE
mode. It does not change your Ren'Py source — assignment is metadata managed
in BranchForge.

## Status workflow

Labels also carry a status: **Draft**, **Review**, or **Final**. Use status
filters in the flow graph to focus on scenes that still need polish.

## Tips

- Put prologue and reunion scenes in **SHARED** visibility so every route can reach them.
- Use **EXCLUSIVE** for route-specific scenes after a major branch.
- Pair **DUO_PAIR** visibility with a pair group when tracking duo endings.
