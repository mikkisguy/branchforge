---
title: Import & Export
---

# Import & Export

BranchForge supports importing existing Ren'Py projects and exporting your work for use in Ren'Py.

## Zip Import

[screenshot of import dialog]

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

## Zip Export

[screenshot of export dialog]

Export your project as a Ren'Py-compatible ZIP:

1. Open your project
2. Click "Export" in the project menu
3. Choose what to include
4. Download the ZIP file

The ZIP contains RPY files ready to drop into a Ren'Py project.

## GitLab Sync

[screenshot of GitLab sync configuration]

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

### Conflict Detection

If GitLab has changes that conflict with your local work, BranchForge will detect this and show you the conflicts. You can:

- Accept the remote version
- Keep your local version
- Manually merge

::: tip
We recommend pulling before pushing to minimize conflicts, especially when collaborating with others.
:::
