/**
 * Zip Import Files Dialog - Logic Hook
 *
 * Contains all state management, effects, and handler functions
 * extracted from ZipImportFilesDialog for line-count management.
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useLabels } from "@/hooks/useLabels";
import { projectFilesKeys, characterKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { charactersApi } from "@/lib/api/characters";
import { projectFilesApi } from "@/lib/api/project-files";
import { validateZipFile } from "@/lib/zip-validation";
import {
  zipImportReducer,
  initialZipImportState,
} from "./ZipImportFilesDialogReducer";

export function useZipImportFilesDialog(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  projectId: string
) {
  const { success, error } = useToast();
  const { invalidateLabels } = useLabels();
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(zipImportReducer, initialZipImportState);
  const { selectedFile, importState, showCharacterWizard, detectedCharacters } =
    state;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdRef = useRef(0);

  // Reset state when dialog closes
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!open) {
      importIdRef.current += 1;
      dispatch({ type: "RESET" });
    }
  }, [open]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validationResult = validateZipFile(file);
      if (typeof validationResult === "string") {
        error(validationResult);
        return;
      }

      dispatch({ type: "SET_SELECTED_FILE", file: validationResult });
    },
    [error]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;

      const validationResult = validateZipFile(file);
      if (typeof validationResult === "string") {
        error(validationResult);
        return;
      }

      dispatch({ type: "SET_SELECTED_FILE", file: validationResult });
    },
    [error]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleRemoveFile = useCallback(() => {
    dispatch({ type: "SET_SELECTED_FILE", file: null });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedFile) {
      error("Please select a file to import");
      return;
    }

    dispatch({
      type: "SET_IMPORT_STATE",
      importState: {
        status: "uploading",
        progress: 0,
        message: "Uploading file...",
      },
    });

    try {
      const result = await projectFilesApi.importZip(projectId, selectedFile, {
        onProgress: (loaded, total) => {
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
          dispatch({
            type: "UPDATE_UPLOAD_PROGRESS",
            progress,
            message: `Uploading... ${progress}%`,
          });
        },
      });

      if (result.success) {
        const currentImportId = importIdRef.current;

        try {
          await Promise.all([
            invalidateLabels(),
            queryClient.refetchQueries({
              queryKey: projectFilesKeys.lists(projectId),
            }),
            queryClient.refetchQueries({
              queryKey: projectFilesKeys.listsWithSource(projectId, "GITLAB"),
            }),
            queryClient.refetchQueries({
              queryKey: projectFilesKeys.listsWithSource(projectId, "ZIP"),
            }),
            queryClient.refetchQueries({
              queryKey: characterKeys.lists(projectId),
            }),
          ]);
        } catch (cacheError) {
          console.error("Failed to refresh cache after import:", cacheError);
        }

        try {
          if (currentImportId !== importIdRef.current) return;

          // react-doctor-disable-next-line react-doctor/async-defer-await
          const detectionResult =
            await charactersApi.detectCharacters(projectId);

          if (currentImportId !== importIdRef.current) return;

          if (detectionResult.characters.length > 0) {
            dispatch({
              type: "CHARACTERS_DETECTED",
              characters: {
                characters: detectionResult.characters,
                excludedTags: detectionResult.excludedTags,
                narratorCharacterTags: detectionResult.narratorCharacterTags,
                conflicts: detectionResult.conflicts,
                existingTags: detectionResult.existingTags,
              },
            });
            return;
          }
        } catch (err) {
          console.error("Failed to detect characters:", err);
          if (currentImportId !== importIdRef.current) return;
        }

        dispatch({
          type: "SET_IMPORT_STATE",
          importState: {
            status: "success",
            progress: 100,
            message: "Import completed successfully",
            result: {
              filesImported: result.filesImported,
              filesUpdated: result.filesUpdated,
              filesSkipped: result.filesSkipped,
              labelsCreated: result.labelsCreated,
            },
          },
        });

        success(
          `Imported ${result.filesImported} files, ${result.labelsCreated} labels`
        );
      } else {
        dispatch({
          type: "SET_IMPORT_STATE",
          importState: {
            status: "error",
            progress: 0,
            message: "Import failed",
            error: result.error || "Unknown error",
          },
        });
        error(result.error || "Import failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Import failed";
      dispatch({
        type: "SET_IMPORT_STATE",
        importState: {
          status: "error",
          progress: 0,
          message: "Import failed",
          error: errorMessage,
        },
      });
      error(errorMessage);
    }
  }, [selectedFile, projectId, success, error, invalidateLabels, queryClient]);

  const handleClose = useCallback(() => {
    if (importState.status === "uploading" || showCharacterWizard) return;
    onOpenChange(false);
  }, [importState.status, showCharacterWizard, onOpenChange]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }

      if (importState.status === "uploading" || showCharacterWizard) {
        return;
      }

      onOpenChange(false);
    },
    [importState.status, onOpenChange, showCharacterWizard]
  );

  const handleRetry = useCallback(() => {
    dispatch({ type: "RESET_FILE_AND_IMPORT" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return {
    state,
    dispatch,
    importState,
    selectedFile,
    showCharacterWizard,
    detectedCharacters,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleRemoveFile,
    handleImport,
    handleClose,
    handleDialogOpenChange,
    handleRetry,
  };
}
