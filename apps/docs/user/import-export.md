---
title: Import & Export
---

# Import & Export

BranchForge supports importing existing Ren'Py projects and exporting your work for use in Ren'Py.

## Zip Import

<!-- screenshot: import-dialog.png — Zip import dialog, light theme -->

Import a Ren'Py project as a ZIP archive:

1. Go to **Settings** and choose **Import from Zip**
2. Select your ZIP file
3. Choose whether to create a new project or merge into an existing one

When preparing your ZIP:

- **Include your script files** (`.rpy`)
- **Exclude media** like image and audio folders — BranchForge only needs the scripts
- **Maximum file size: 50 MB**

::: warning
Including large media folders wastes space and may exceed the size limit. Zip up only the `game/` folder's `.rpy` files. Compiled `.rpyc` files are ignored on import — no need to exclude them, but they add nothing.
:::

The importer parses your RPY files and extracts:

- Dialogue and narration
- Characters (auto-detected)
- Labels for flow graph generation

Ren'Py's standard UI and configuration files—`screens.rpy`, `screen.rpy`,
`options.rpy`, and `gui.rpy`—stay editable in Script Mode and are exported
with their content intact. BranchForge does not move their declarations
into generated files or import their UI labels as story labels. This also
applies when those files are in subdirectories or use different casing.

Persistent settings (`default persistent.…`), string defaults, and name
constants such as `define ne_first = "Nelson"` remain in your source files.

If an older import removed a setting such as `default quick_menu = True`,
restore it from your original project or reimport the original file.
BranchForge preserves the restored value and excludes matching declarations
from generated files, even if an older managed variable still exists.
Previously removed declarations are not restored automatically.

## Zip Export

<!-- screenshot: export-dialog.png — Export dialog, dark theme -->

Export your project as a Ren'Py-compatible ZIP:

1. Open your project
2. Click "Export" in the project menu
3. Choose what to include
4. Download the ZIP file

The ZIP contains RPY files ready to drop into a Ren'Py project, including any `.rpy` files you created in BranchForge before exporting.

## GitLab Sync

<!-- screenshot: gitlab-sync.png — GitLab sync settings (redact token), dark theme -->

BranchForge syncs directly with GitLab repositories:

### Pull from GitLab

Fetch RPY files from a GitLab repository:

1. Configure your GitLab token and repository URL in project settings
2. Click "Pull from GitLab"
3. BranchForge updates your project with the latest changes

### Push to GitLab

Push your changes back to GitLab:

1. Commit your changes in BranchForge
2. Click "Push to GitLab"
3. Review the changes and confirm

The sync dialog lists pending file creations, moves, and deletions separately
from ordinary content changes. You can cancel a creation, undo a rename, or
restore a deleted GitLab file before pushing. **Discard all** restores the
remote file structure in one operation. Pulling is paused only while one of
these structural changes is pending; ordinary autosaved edits do not block a
pull.

### Conflict Detection (read-only review)

If GitLab has changes that conflict with your local work, BranchForge detects
them and shows a read-only conflict review. You can compare versions side by
side, but **Apply is not available in this beta** — resolve conflicts in
GitLab or locally, then pull again.

::: warning
GitLab conflict review is inspect-only. Do not expect in-app resolution to
write files back to your repository.
:::

::: tip
Pull before pushing to minimize conflicts, especially when collaborating with
others.
:::
