---
title: Your First Project
---

# Your First Project

BranchForge works with **existing Ren'Py projects** — you don't create an empty project from scratch. Instead, you import a project that you've already initialized with the [Ren'Py engine](https://www.renpy.org/).

## Prerequisite: A Ren'Py Project

Before importing, you need a working Ren'Py project on disk. This typically means you've used the Ren'Py launcher or SDK to generate the standard project structure (the `game/` folder with `.rpy` files, screens, etc.).

BranchForge reads the `.rpy` files and extracts labels, dialogue, characters, and flow information from them.

## Importing a Project

Projects are imported from the **Settings** panel, not from the project list page.

1. Open BranchForge and go to **Settings** (gear icon)
2. Choose **Import**:
   - **Zip Import** — upload a `.zip` of your Ren'Py project
   - **GitLab Import** — connect a GitLab repository and pull `.rpy` files directly

BranchForge parses your `.rpy` files, detects labels and characters, and builds the project. See [Import & Export](./import-export) for the full walkthrough.

::: tip
You can import into an existing project to merge new files, or create a brand-new project from the import.
:::

## Project List View

[screenshot of project list]

Once imported, your project appears in the project list. From here you can:

- Open a project to start writing or editing
- View its [flow graph](./flow-graph)
- Manage project settings
- Export or sync back to GitLab

## Next Steps

- Write dialogue and narration in [Write Mode](./writing)
- Edit technical details in [Script Mode](./script-mode)
- Visualize your story structure in the [Flow Graph](./flow-graph)
