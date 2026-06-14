/**
 * Lazy-loaded LabelEditDialog. Code-split from main bundle.
 *
 * The Suspense boundary is gated behind `open` so the chunk only loads
 * when the dialog is actually opened, avoiding a fallback flash on mount.
 */

import { lazy, Suspense } from "react";
import type { LabelEditDialogProps } from "./LabelEditDialog";

const LazyLabelEditDialog = lazy(() =>
  import("./LabelEditDialog").then((module) => ({
    default: module.LabelEditDialog,
  }))
);

export function LabelEditDialog(props: LabelEditDialogProps) {
  if (!props.open) return null;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LazyLabelEditDialog {...props} />
    </Suspense>
  );
}
