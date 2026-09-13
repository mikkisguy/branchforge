---
title: Pair Groups
---

# Pair Groups

Pair groups track **duo endings** — shared conclusions for a specific pair of
characters (for example, two love interests).

## Creating a pair group

1. Ensure both characters exist in the project (import or create manually).
2. Open the pair groups panel in project settings.
3. Select character A and character B (stored in canonical order).
4. Set the **duo ending label** — the Ren'Py label name that resolves the pair ending.

<!-- screenshot: pair-groups.png — Pair groups panel with Elena ↔ Marcus, dark theme, docs demo -->

## Label visibility

Labels meant for a duo ending can use **DUO_PAIR** visibility so they appear
correctly in [ROUTE layout](./flow-graph#route-mode). See
[Routes & Visibility](./routes) for the full visibility model.

## Scope

Pair groups are per-project metadata. They do not modify your `.rpy` files
automatically — you still author the ending label in Script Mode.
