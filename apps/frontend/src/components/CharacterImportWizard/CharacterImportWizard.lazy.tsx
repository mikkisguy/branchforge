/**
 * Lazy-loaded CharacterImportWizard. Code-split from main bundle.
 *
 * The Suspense boundary is gated behind `open` so the chunk only loads
 * when the wizard is actually opened, avoiding a fallback flash on mount.
 */

import { lazy, Suspense } from "react";
import type { CharacterImportWizardProps } from "./CharacterImportWizard";

const LazyCharacterImportWizard = lazy(() =>
  import("./CharacterImportWizard").then((module) => ({
    default: module.CharacterImportWizard,
  }))
);

export function CharacterImportWizard(props: CharacterImportWizardProps) {
  if (!props.open) return null;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LazyCharacterImportWizard {...props} />
    </Suspense>
  );
}
