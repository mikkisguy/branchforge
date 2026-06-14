/**
 * Lazy-loaded GitLabImportDialog. Code-split from main bundle.
 *
 * The Suspense boundary is gated behind `open` so the chunk only loads
 * when the dialog is actually opened, avoiding a fallback flash on mount.
 */

import { lazy, Suspense } from "react";
import type { GitLabImportDialogProps } from "./GitLabImportDialog";

const LazyGitLabImportDialog = lazy(() =>
  import("./GitLabImportDialog").then((module) => ({
    default: module.GitLabImportDialog,
  }))
);

export function GitLabImportDialog(props: GitLabImportDialogProps) {
  if (!props.open) return null;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LazyGitLabImportDialog {...props} />
    </Suspense>
  );
}
