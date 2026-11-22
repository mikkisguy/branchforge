import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  variableInUseResponseSchema,
  type Variable,
  type VariableReference,
} from "@branchforge/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiRequestError } from "@/lib/api/client";
import { variablesApi } from "@/lib/api/variables";
import { variableKeys } from "@/lib/query-keys";

interface DeleteVariableDialogProps {
  variable: Variable;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onOpenReference: (reference: VariableReference) => Promise<boolean>;
}

export function DeleteVariableDialog({
  variable,
  onClose,
  onDelete,
  onOpenReference,
}: DeleteVariableDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const queryKey = variableKeys.references(variable.id);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      variablesApi.listVariableReferences(variable.id, signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const references = data ?? [];
  const canDelete =
    !!data && !isFetching && !isError && references.length === 0;

  const handleDelete = async () => {
    if (!canDelete) return;
    setActionError(null);
    setIsDeleting(true);
    try {
      await onDelete(variable.id);
      onClose();
    } catch (error) {
      const conflict =
        error instanceof ApiRequestError && error.status === 409
          ? variableInUseResponseSchema.safeParse(error.data)
          : null;
      if (conflict?.success) {
        queryClient.setQueryData(queryKey, conflict.data.references);
      } else {
        setActionError(
          error instanceof Error
            ? error.message
            : "Could not delete the variable."
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const openReference = async (reference: VariableReference) => {
    setActionError(null);
    setIsOpening(true);
    try {
      if (await onOpenReference(reference)) {
        onClose();
        return;
      }
      setActionError("Could not open this line. Check the file and try again.");
    } catch {
      setActionError("Could not open this line. Check the file and try again.");
    } finally {
      setIsOpening(false);
    }
  };

  const blocked = references.length > 0;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={handleDelete}
      title="Delete Variable"
      description={`Delete ${variable.key} from your project? This action cannot be undone.`}
      confirmLabel="Delete Variable"
      confirmDisabled={!canDelete}
      className="max-h-[calc(100%-16px)] overflow-y-auto"
      isLoading={isDeleting || isOpening}
      loadingLabel={isOpening ? "Opening script…" : "Deleting…"}
    >
      {(isFetching || isError || blocked || actionError) && (
        <div className="space-y-3 px-6 py-4 text-sm max-sm:px-4">
          {isFetching && <p role="status">Checking script references…</p>}
          {isError && <p role="alert">Could not check script references.</p>}
          {blocked && (
            <>
              <p role="status">
                Resolve these references in Script Mode before deleting.
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {references.map((reference) => (
                  <li key={`${reference.fileId}:${reference.line}`}>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto min-h-8 max-w-full justify-start whitespace-normal break-all px-1 text-left text-foreground underline"
                      disabled={isOpening || isFetching}
                      onClick={() => void openReference(reference)}
                    >
                      {reference.filePath}:{reference.line}
                    </Button>
                    <span className="ml-2 text-muted-foreground">
                      {reference.kind === "condition"
                        ? "Condition"
                        : "Assignment"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {(isError || blocked) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching || isOpening || isDeleting}
              onClick={() => {
                setActionError(null);
                void refetch();
              }}
            >
              Check again
            </Button>
          )}
          {actionError && (
            <p role="alert" className="text-destructive">
              {actionError}
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
