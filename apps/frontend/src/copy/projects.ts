/**
 * Project management strings.
 *
 * Projects are created via import (zip or GitLab), not via a "New Project"
 * button. The user must have an existing Ren'Py project to import.
 */
export const PROJECTS_COPY = {
  list: {
    title: "Projects",
    emptyTitle: "No projects yet",
    emptyDescription: "Import a Ren'Py project via Settings to get started.",
  },
  settings: {
    importTitle: "Import Project",
    importZipTab: "Import from Zip",
    importGitLabTab: "Import from GitLab",
    importHint: "You need an existing Ren'Py project to import.",
  },
  actions: {
    deleteConfirm:
      "Are you sure you want to delete this project? This cannot be undone.",
    deleteTitle: "Delete Project",
    openProject: "Open project",
    exportProject: "Export",
    manageSettings: "Settings",
  },
} as const;
