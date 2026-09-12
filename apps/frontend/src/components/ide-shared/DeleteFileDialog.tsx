/**
 * Delete File Dialog
 *
 * Confirmation dialog for deleting a project file. Loads the authoritative
 * delete impact report (labels defined in the file and references to them
 * from other files) before the destructive action can be confirmed, and
 * requires typing the file basename once the impact crosses the strong
 * confirmation threshold.
 *
 * When a pending autosave could not be flushed (`canForce`), the dialog
 * offers the force-delete pathway which discards unsaved changes.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { projectFilesApi } from "@/lib/api/project-files";
import type {
  DeleteFileImpact,
  DeleteFileImpactLabel,
  DeleteFileImpactReference,
} from "@/lib/api/project-files";
import { projectFilesKeys } from "@/lib/query-keys";

export interface DeleteFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  file: { id: string; filePath: string };
  /**
   * True when a pending autosave could not be flushed before opening the
   * dialog. Enables the force-delete pathway.
   */
  canForce?: boolean;
  onDelete: (options: { force: boolean }) => Promise<boolean>;
  isDeleting?: boolean;
  serverError?: string | null;
  onDismissServerError?: () => void;
}

/**
 * Per-category occurrence threshold at which the user must type the file
 * basename to confirm deletion.
 */
export const DELETE_TYPED_CONFIRM_THRESHOLD = 10;

const BASENAME_INPUT_ID = "delete-file-basename-input";
const BASENAME_ERROR_ID = "delete-file-basename-error";

function getFileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function OccurrenceList({
  heading,
  entries,
  renderEntry,
}: {
  heading: string;
  entries: Array<DeleteFileImpactLabel | DeleteFileImpactReference>;
  renderEntry: (
    entry: DeleteFileImpactLabel | DeleteFileImpactReference
  ) => string;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{heading}</p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {entries.map((entry, index) => (
          <li key={`${heading}-${index}`} className="break-words">
            {renderEntry(entry)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeleteFileDialog({
  open,
  onOpenChange,
  projectId,
  file,
  canForce = false,
  onDelete,
  isDeleting = false,
  serverError = null,
  onDismissServerError,
}: DeleteFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DeleteFileDialogContent
          onOpenChange={onOpenChange}
          projectId={projectId}
          file={file}
          canForce={canForce}
          onDelete={onDelete}
          isDeleting={isDeleting}
          serverError={serverError}
          onDismissServerError={onDismissServerError}
        />
      ) : null}
    </Dialog>
  );
}

type DeleteFileDialogContentProps = Omit<DeleteFileDialogProps, "open">;

function DeleteFileDialogContent({
  onOpenChange,
  projectId,
  file,
  canForce = false,
  onDelete,
  isDeleting,
  serverError,
  onDismissServerError,
}: DeleteFileDialogContentProps) {
  const [typedBasename, setTypedBasename] = useState("");
  const [forceChecked, setForceChecked] = useState(false);

  const {
    data: impact,
    isLoading: isLoadingImpact,
    isFetching: isFetchingImpact,
    isError: isImpactError,
    refetch: refetchImpact,
  } = useQuery<DeleteFileImpact, Error>({
    queryKey: projectFilesKeys.deleteImpact(projectId, file.id),
    queryFn: () => projectFilesApi.getDeleteImpact(projectId, file.id),
    enabled: !!projectId,
    staleTime: 0,
  });

  // Reset typed confirmation and force choice whenever the dialog opens
  // for a different file.
  useEffect(() => {
    setTypedBasename("");
    setForceChecked(false);
  }, [file.id]);

  const basename = getFileBasename(file.filePath);
  const requiresTypedConfirmation =
    !!impact &&
    (impact.labelCount >= DELETE_TYPED_CONFIRM_THRESHOLD ||
      impact.referenceCount >= DELETE_TYPED_CONFIRM_THRESHOLD);

  const typedConfirmationSatisfied =
    !requiresTypedConfirmation || typedBasename === basename;

  // Confirmation stays disabled until the authoritative impact report has
  // loaded — never allow deleting on stale or missing data.
  const isConfirmDisabled =
    isDeleting || isFetchingImpact || isImpactError || !impact;

  const displayedError = serverError ?? undefined;

  const handleDelete = async () => {
    if (isConfirmDisabled || !typedConfirmationSatisfied) return;
    onDismissServerError?.();
    try {
      const deleted = await onDelete({ force: canForce && forceChecked });
      if (deleted) {
        onOpenChange(false);
      }
    } catch {
      // Failure is surfaced via serverError; keep the dialog open.
    }
  };

  return (
    <DialogContent className="w-[520px] max-w-[95vw]">
      <DialogHeader className="flex flex-row items-center justify-between gap-y-0 pb-4">
        <DialogTitle className="flex items-center gap-2">
          <Trash2 className="size-5 text-destructive" aria-hidden="true" />
          Delete File
        </DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          disabled={isDeleting}
        >
          <X className="size-5" />
        </Button>
      </DialogHeader>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Delete{" "}
          <span className="font-medium text-foreground">{file.filePath}</span>{" "}
          and everything in it? This cannot be undone.
        </p>

        {isLoadingImpact && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading deletion impact…
          </p>
        )}

        {isImpactError && (
          <div
            className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Could not load the deletion impact. Confirm stays disabled until
              the impact is known.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetchImpact()}
              disabled={isFetchingImpact}
            >
              Retry
            </Button>
          </div>
        )}

        {impact && (
          <div
            className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3"
            aria-live="polite"
          >
            <p className="text-sm">
              <span className="font-medium">
                {impact.labelCount}{" "}
                {impact.labelCount === 1 ? "label" : "labels"}
              </span>{" "}
              defined in this file,{" "}
              <span className="font-medium">
                {impact.referenceCount}{" "}
                {impact.referenceCount === 1 ? "reference" : "references"}
              </span>{" "}
              from other files.
            </p>

            <OccurrenceList
              heading="Labels in this file"
              entries={impact.labels}
              renderEntry={(entry) =>
                `${(entry as DeleteFileImpactLabel).title}${
                  (entry as DeleteFileImpactLabel).labelName
                    ? ` (${(entry as DeleteFileImpactLabel).labelName})`
                    : ""
                }`
              }
            />

            <OccurrenceList
              heading="Referenced from"
              entries={impact.references}
              renderEntry={(entry) => {
                const reference = entry as DeleteFileImpactReference;
                const line =
                  reference.lineNumber === null
                    ? "line unknown"
                    : `line ${reference.lineNumber}`;
                const sourceLabel =
                  reference.sourceLabelName ?? reference.sourceLabelTitle;
                return `${reference.referenceType}: ${reference.targetLabelName} from ${reference.sourceFilePath} · ${sourceLabel} · ${line}`;
              }}
            />
          </div>
        )}

        {requiresTypedConfirmation && (
          <div className="space-y-2">
            <Label htmlFor={BASENAME_INPUT_ID}>
              Type <span className="font-mono font-semibold">{basename}</span>{" "}
              to confirm this deletion
            </Label>
            <Input
              id={BASENAME_INPUT_ID}
              value={typedBasename}
              onChange={(event) => setTypedBasename(event.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              aria-invalid={
                typedBasename.length > 0 && !typedConfirmationSatisfied
                  ? true
                  : undefined
              }
              aria-describedby={
                typedBasename.length > 0 && !typedConfirmationSatisfied
                  ? BASENAME_ERROR_ID
                  : undefined
              }
            />
            <FormErrorMessage
              id={BASENAME_ERROR_ID}
              message={
                typedBasename.length > 0 && !typedConfirmationSatisfied
                  ? "Typed name does not match the file name yet."
                  : undefined
              }
            />
          </div>
        )}

        {canForce && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="flex items-start gap-2 text-sm text-foreground">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-amber-600"
                aria-hidden="true"
              />
              <span>
                This file has unsaved changes that could not be saved. Force
                delete discards them permanently.
              </span>
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={forceChecked}
                onChange={(event) => setForceChecked(event.target.checked)}
                disabled={isDeleting}
                className="size-4 accent-[var(--theme-color)]"
                aria-label="Discard unsaved changes and force delete"
              />
              <span>Discard unsaved changes and delete anyway</span>
            </label>
          </div>
        )}

        <FormErrorMessage
          id="delete-file-server-error"
          message={displayedError}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isConfirmDisabled || !typedConfirmationSatisfied}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete File"
            )}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
