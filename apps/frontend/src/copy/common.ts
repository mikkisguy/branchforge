/**
 * Shared/universal strings used across many components.
 */
export const commonCopy = {
  actions: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    close: "Close",
    confirm: "Confirm",
    retry: "Retry",
    discard: "Discard",
    export: "Export",
    import: "Import",
  },
  status: {
    loading: "Loading…",
    saving: "Saving…",
    saved: "Saved",
    error: "Something went wrong",
    notFound: "Not found",
    empty: "Nothing here yet",
  },
  errors: {
    networkError: "Network error. Please check your connection.",
    permissionDenied: "You don't have permission to do that.",
    generic: "An unexpected error occurred. Please try again.",
  },
} as const;
