/**
 * Zip Import Project Dialog - Status Panels
 *
 * Renders the uploading spinner, success result, and error state.
 */

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportState } from "./ZipImportProjectDialogReducer";

interface ZipImportProjectDialogStatusProps {
  importState: ImportState;
  createdProject?: { id: string } | null;
  onSuccess?: (importedProject?: { id: string }) => void;
  onRetry?: () => void;
  onClose?: () => void;
}

export function ZipImportProjectDialogUploading({
  importState,
}: {
  importState: ImportState;
}) {
  if (importState.status !== "uploading") return null;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="size-8 animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{importState.message}</p>
    </div>
  );
}

export function ZipImportProjectDialogSuccess({
  importState,
  createdProject,
  onSuccess,
  onClose,
}: ZipImportProjectDialogStatusProps) {
  if (importState.status !== "success") return null;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <CheckCircle2 className="size-12 text-green-500 mb-4" />
      <h3 className="text-lg font-medium mb-2">Import Successful!</h3>
      <p className="text-sm text-muted-foreground text-center mb-4">
        {importState.result?.filesImported} files imported,{" "}
        {importState.result?.labelsCreated} labels created
      </p>
      <Button
        type="button"
        onClick={() => {
          onSuccess?.(createdProject ?? undefined);
          onClose?.();
        }}
      >
        Close
      </Button>
    </div>
  );
}

export function ZipImportProjectDialogError({
  importState,
  onRetry,
  onClose,
}: ZipImportProjectDialogStatusProps) {
  if (importState.status !== "error") return null;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertCircle className="size-12 text-destructive mb-4" />
      <h3 className="text-lg font-medium mb-2">Import Failed</h3>
      <p className="text-sm text-muted-foreground text-center mb-4">
        {importState.error}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onRetry?.()}>
          Try Again
        </Button>
        <Button type="button" variant="outline" onClick={() => onClose?.()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
