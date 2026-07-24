/**
 * Zip Import Files Dialog - Status Panels
 *
 * Renders the upload progress, success result, and error states.
 */

import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ImportState } from "./ZipImportFilesDialogReducer";

interface ZipImportFilesDialogStatusProps {
  importState: ImportState;
}

export function ZipImportFilesDialogProgress({
  importState,
}: ZipImportFilesDialogStatusProps) {
  if (
    importState.status !== "uploading" &&
    importState.status !== "processing"
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{importState.message}</span>
        <span className="font-medium">{importState.progress}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${importState.progress}%` }}
        />
      </div>
    </div>
  );
}

export function ZipImportFilesDialogSuccess({
  importState,
}: ZipImportFilesDialogStatusProps) {
  if (importState.status !== "success" || !importState.result) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-5" />
        <span className="font-medium">Import completed successfully!</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-3 bg-muted rounded-md">
          <p className="text-muted-foreground">Files Imported</p>
          <p className="text-2xl font-bold">
            {importState.result.filesImported}
          </p>
        </div>
        <div className="p-3 bg-muted rounded-md">
          <p className="text-muted-foreground">Labels Created</p>
          <p className="text-2xl font-bold">
            {importState.result.labelsCreated}
          </p>
        </div>
      </div>
      {importState.result.filesUpdated > 0 && (
        <p className="text-sm text-muted-foreground">
          {importState.result.filesUpdated} files updated
        </p>
      )}
      {importState.result.filesSkipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {importState.result.filesSkipped} files skipped (unchanged)
        </p>
      )}
    </div>
  );
}

export function ZipImportFilesDialogError({
  importState,
}: ZipImportFilesDialogStatusProps) {
  if (importState.status !== "error") return null;

  return (
    <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="size-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-red-800 dark:text-red-200">
            Import Failed
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            {importState.error}
          </p>
        </div>
      </div>
    </div>
  );
}
