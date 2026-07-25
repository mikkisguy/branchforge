/**
 * Lazy-loaded RouteEditDialog. Code-split from main bundle.
 *
 * The Suspense boundary is gated behind `open` so the chunk only loads
 * when the dialog is actually opened, avoiding a fallback flash on mount.
 */

import { lazy, Suspense } from "react";
import type { RouteEditDialogProps } from "./RouteEditDialog";

const LazyRouteEditDialog = lazy(() =>
  import("./RouteEditDialog").then((module) => ({
    default: module.RouteEditDialog,
  }))
);

export function RouteEditDialog(props: RouteEditDialogProps) {
  if (!props.open) return null;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LazyRouteEditDialog {...props} />
    </Suspense>
  );
}
