/**
 * Rename File Dialog
 *
 * Dialog for renaming or moving a project file. Edits the **full relative
 * path** (e.g. `chapter1/intro.rpy`) rather than just the basename, matching
 * the backend contract and allowing moves between folders in one action.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { canonicalizeRpyFilePath } from "@branchforge/shared";
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

export interface RenameFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current full relative path of the file being renamed. */
  currentFilePath: string;
  onRename: (newFilePath: string) => Promise<boolean>;
  isRenaming?: boolean;
  serverError?: string | null;
  onDismissServerError?: () => void;
}

const FILE_PATH_ERROR_ID = "rename-file-path-error";

function getValidationError(filePath: string): string | null {
  const result = canonicalizeRpyFilePath(filePath);
  return result.ok ? null : result.message;
}

export function RenameFileDialog({
  open,
  onOpenChange,
  currentFilePath,
  onRename,
  isRenaming = false,
  serverError = null,
  onDismissServerError,
}: RenameFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <RenameFileDialogContent
          onOpenChange={onOpenChange}
          currentFilePath={currentFilePath}
          onRename={onRename}
          isRenaming={isRenaming}
          serverError={serverError}
          onDismissServerError={onDismissServerError}
        />
      ) : null}
    </Dialog>
  );
}

type RenameFileDialogContentProps = Omit<RenameFileDialogProps, "open">;

function RenameFileDialogContent({
  onOpenChange,
  currentFilePath,
  onRename,
  isRenaming,
  serverError,
  onDismissServerError,
}: RenameFileDialogContentProps) {
  const [filePath, setFilePath] = useState(currentFilePath);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input and pre-select the basename so the common case
  // (rename in place) is a type-away, while the folder prefix stays visible
  // for full-relative-path moves.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const basenameStart = currentFilePath.lastIndexOf("/") + 1;
    const basenameEnd = currentFilePath.length;
    input.setSelectionRange(basenameStart, basenameEnd);
  }, [currentFilePath]);

  const handleFilePathChange = (value: string) => {
    setFilePath(value);
    setValidationError(getValidationError(value));
    onDismissServerError?.();
  };

  const isUnchanged = filePath.trim() === currentFilePath;
  const isSubmitDisabled =
    isRenaming ||
    isUnchanged ||
    filePath.trim() === "" ||
    getValidationError(filePath) !== null;

  const displayedError = validationError ?? serverError ?? undefined;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const nextValidationError = getValidationError(filePath);
    if (nextValidationError) {
      setValidationError(nextValidationError);
      return;
    }

    setValidationError(null);
    const canonical = canonicalizeRpyFilePath(filePath);
    if (!canonical.ok) {
      setValidationError(canonical.message);
      return;
    }

    const renamed = await onRename(canonical.filePath);
    if (renamed) {
      onOpenChange(false);
    }
  };

  return (
    <DialogContent className="w-[500px] max-w-[95vw]">
      <DialogHeader className="flex flex-row items-center justify-between gap-y-0 pb-4">
        <DialogTitle>Rename or Move File</DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          disabled={isRenaming}
        >
          <X className="size-5" />
        </Button>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">
          Enter the full relative path, including folders, to rename or move the
          file. The change stays in BranchForge until the next GitLab export.
        </p>

        <div className="space-y-2">
          <Label htmlFor="rename-file-path">File path *</Label>
          <Input
            id="rename-file-path"
            ref={inputRef}
            value={filePath}
            onChange={(event) => handleFilePathChange(event.target.value)}
            disabled={isRenaming}
            aria-required="true"
            aria-invalid={displayedError ? true : undefined}
            aria-describedby={displayedError ? FILE_PATH_ERROR_ID : undefined}
          />
        </div>

        <FormErrorMessage id={FILE_PATH_ERROR_ID} message={displayedError} />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRenaming}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitDisabled}>
            {isRenaming ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Renaming…
              </>
            ) : (
              "Rename File"
            )}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
