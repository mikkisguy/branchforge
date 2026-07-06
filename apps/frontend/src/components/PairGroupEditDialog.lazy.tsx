/**
 * Lazy-loaded PairGroupEditDialog. Code-split from main bundle.
 */

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { PairGroupEditDialogProps } from "./PairGroupEditDialog";

const LazyPairGroupEditDialog = lazy(() =>
  import("./PairGroupEditDialog").then((module) => ({
    default: module.PairGroupEditDialog,
  }))
);

export function PairGroupEditDialog(props: PairGroupEditDialogProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LazyPairGroupEditDialog {...props} />
    </Suspense>
  );
}
