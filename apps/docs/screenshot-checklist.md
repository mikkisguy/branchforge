---
title: Screenshot Capture Checklist
---

# Screenshot Capture Checklist (internal)

Use this checklist when capturing documentation screenshots. Filenames are
stable — do not rename without updating the user guide references.

**Demo state:** run `pnpm db:seed:docs-demo` and sign in with
`docs-demo@branchforge.test` / `docsdemo123`. Open the **BranchForge Docs Demo**
project unless noted otherwise.

**Viewport:** 1440×900 desktop unless a page specifies mobile.

| Filename                            | Page / location                 | Theme          | Demo state notes                               |
| ----------------------------------- | ------------------------------- | -------------- | ---------------------------------------------- |
| `branchforge-flow-view.png`         | Docs home hero                  | Dark           | remarkablegames Ren'Py Example; Flow open      |
| `branchforge-flow-view-light.png`   | Docs home hero                  | Light          | remarkablegames Ren'Py Example; Flow open      |
| `branchforge-script-mode.png`       | Docs home hero                  | Dark           | remarkablegames Ren'Py Example; Script open    |
| `branchforge-script-mode-light.png` | Docs home hero                  | Light          | remarkablegames Ren'Py Example; Script open    |
| `branchforge-write-mode.png`        | Docs home hero                  | Dark           | remarkablegames Ren'Py Example; Dialogue open  |
| `branchforge-write-mode-light.png`  | Docs home hero                  | Light          | remarkablegames Ren'Py Example; Dialogue open  |
| `project-list.png`                  | Home → project list after login | Dark (default) | Docs demo project visible                      |
| `write-mode-entry.png`              | Project → Write Mode            | Dark           | `start` label, dialogue visible                |
| `write-mode-dialogue.png`           | Write Mode editor               | Dark           | Elena + Marcus lines in `start`                |
| `write-mode-badges.png`             | Write Mode                      | Dark           | `elena_route_start` with trust condition badge |
| `script-mode-editor.png`            | Script Mode                     | Dark           | `game/script.rpy` open                         |
| `script-mode-file-tree.png`         | Script Mode file tree           | Dark           | `script.rpy` + `epilogue.rpy`                  |
| `flow-mode.png`                     | Flow graph → FLOW layout        | Dark           | Full graph with split/rejoin                   |
| `route-mode.png`                    | Flow graph → ROUTE layout       | Dark           | Elena + Marcus columns, shared center          |
| `file-mode.png`                     | Flow graph → FILE layout        | Dark           | Two file columns                               |
| `flow-node-drag.png`                | Flow graph (mid-drag)           | Dark           | One node offset from saved position            |
| `flow-filters.png`                  | Flow graph filter panel         | Dark           | Route filter applied (Elena)                   |
| `import-dialog.png`                 | Settings → Zip Import           | Light          | File picker step                               |
| `export-dialog.png`                 | Project menu → Export           | Dark           | Export options visible                         |
| `gitlab-sync.png`                   | Project settings → GitLab       | Dark           | Token + repo fields (redact token)             |
| `character-list.png`                | Characters panel                | Dark           | Elena + Marcus                                 |
| `dialogue-linking.png`              | Character detail → lines        | Dark           | Elena dialogue list                            |
| `variables-list.png`                | Variables panel                 | Dark           | `chose_elena`, `met_marcus`                    |
| `stats-list.png`                    | Stats panel                     | Dark           | `trust` stat for Elena                         |
| `routes-config.png`                 | Routes settings                 | Dark           | Elena + Marcus routes                          |
| `world-bible.png`                   | World bible panel               | Dark           | Café Lantern entry                             |
| `pair-groups.png`                   | Pair groups panel               | Dark           | Elena ↔ Marcus duo                             |
| `settings-goals.png`                | User settings                   | Light          | Daily goal 500, Forest theme                   |
| `file-management.png`               | Script Mode file menu           | Dark           | Rename/move/delete menu open                   |

Store captures under `apps/docs/public/images/` when added to the site.
