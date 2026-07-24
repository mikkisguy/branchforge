/**
 * Lazy-loaded CharacterEditDialog. Code-split from main bundle.
 *
 * The Suspense boundary is gated behind `open` so the chunk only loads
 * when the dialog is actually opened, avoiding a fallback flash on mount.
 */

import { lazy, Suspense } from "react";
import type { CharacterEditDialogProps } from "./CharacterEditDialog";

const LazyCharacterEditDialog = lazy(() =>
  import("./CharacterEditDialog").then((module) => ({
    default: module.CharacterEditDialog,
  }))
);

export function CharacterEditDialog(props: CharacterEditDialogProps) {
  if (!props.open) return null;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LazyCharacterEditDialog {...props} />
    </Suspense>
  );
}
