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

export interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (filePath: string) => Promise<unknown>;
  isCreating?: boolean;
  serverError?: string | null;
  onDismissServerError?: () => void;
}

const FILE_PATH_ERROR_ID = "create-file-path-error";

function getValidationError(filePath: string): string | null {
  const result = canonicalizeRpyFilePath(filePath);
  return result.ok ? null : result.message;
}

export function CreateFileDialog({
  open,
  onOpenChange,
  onCreate,
  isCreating = false,
  serverError = null,
  onDismissServerError,
}: CreateFileDialogProps) {
  const [filePath, setFilePath] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const previousOpenRef = useRef(false);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      setFilePath("");
      setValidationError(null);
      onDismissServerError?.();
    }
    previousOpenRef.current = open;
  }, [open, onDismissServerError]);

  const handleFilePathChange = (value: string) => {
    setFilePath(value);
    setValidationError(getValidationError(value));
    onDismissServerError?.();
  };

  const isSubmitDisabled =
    isCreating ||
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
    try {
      await onCreate(filePath);
    } catch {
      return;
    }
    setFilePath("");
    setValidationError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[500px] max-w-[95vw]">
        <DialogHeader className="flex flex-row items-center justify-between gap-y-0 pb-4">
          <DialogTitle>New File</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            disabled={isCreating}
          >
            <X className="size-5" />
          </Button>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">
            The file is created in BranchForge and included in the next ZIP or
            GitLab export.
          </p>

          <div className="space-y-2">
            <Label htmlFor="create-file-path">File path *</Label>
            <Input
              id="create-file-path"
              value={filePath}
              onChange={(event) => handleFilePathChange(event.target.value)}
              placeholder="labels/chapter_01.rpy"
              disabled={isCreating}
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
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create File"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
