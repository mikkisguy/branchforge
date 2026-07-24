/**
 * Lazy-loaded ZipImportProjectDialog. Code-split from main bundle.
 *
 * The Suspense boundary is gated behind `open` so the chunk only loads
 * when the dialog is actually opened, avoiding a fallback flash on mount.
 */

import { lazy, Suspense } from "react";
import type { ZipImportProjectDialogProps } from "./ZipImportProjectDialog";

const LazyZipImportProjectDialog = lazy(() =>
  import("./ZipImportProjectDialog").then((module) => ({
    default: module.ZipImportProjectDialog,
  }))
);

export function ZipImportProjectDialog(props: ZipImportProjectDialogProps) {
  if (!props.open) return null;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LazyZipImportProjectDialog {...props} />
    </Suspense>
  );
}
