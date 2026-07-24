/**
 * Zip Import Project Dialog - Logic Hook
 *
 * Contains all state management, effects, and handler functions
 * extracted from ZipImportProjectDialog for line-count management.
 */

import { useReducer, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useImportZipProject } from "@/hooks/useImportZipProject";
import { charactersApi } from "@/lib/api/characters";
import { validateZipFile } from "@/lib/zip-validation";
import {
  zipImportReducer,
  initialZipImportState,
} from "./ZipImportProjectDialogReducer";

export function useZipImportProjectDialog(
  open: boolean,
  onOpenChange: (open: boolean) => void
) {
  const [state, dispatch] = useReducer(zipImportReducer, initialZipImportState);

  const importSucceededRef = useRef(false);
  const didCallOnSuccessRef = useRef(false);

  const { success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdRef = useRef(0);
  const importMutation = useImportZipProject();

  // Reset state when dialog closes
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!open) {
      importIdRef.current += 1;
      dispatch({ type: "RESET" });
      importSucceededRef.current = false;
      didCallOnSuccessRef.current = false;
    }
  }, [open]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validationResult = validateZipFile(file);
      if (typeof validationResult === "string") {
        dispatch({ type: "SET_SELECTED_FILE", file: null });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        error(`${validationResult}: ${file.name}`);
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
        dispatch({ type: "SET_SELECTED_FILE", file: null });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        error(`${validationResult}: ${file.name}`);
        return;
      }

      dispatch({ type: "SET_SELECTED_FILE", file: validationResult });
    },
    [error]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleImport = async () => {
    if (!state.selectedFile || !state.projectName.trim()) {
      error("Please select a file and enter a project name");
      return;
    }

    dispatch({
      type: "SET_IMPORT_STATE",
      importState: {
        status: "uploading",
        message: "Uploading file...",
      },
    });

    try {
      const data = await importMutation.mutateAsync({
        file: state.selectedFile,
        projectName: state.projectName.trim(),
        projectDescription: state.projectDescription.trim() || undefined,
      });

      if (!data.success) {
        throw new Error(data.error || "Failed to import project");
      }

      dispatch({
        type: "SET_CHARACTER_WIZARD",
        show: false,
        characters: null,
        project: data.project,
      });

      importSucceededRef.current = true;
      didCallOnSuccessRef.current = false;

      const currentImportId = importIdRef.current;

      try {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const detectionResult = await charactersApi.detectCharacters(
          data.project.id
        );

        if (currentImportId !== importIdRef.current) return;

        if (detectionResult.characters.length > 0) {
          dispatch({
            type: "SET_CHARACTER_WIZARD",
            show: true,
            characters: detectionResult,
            project: data.project,
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
          message: "Import completed successfully",
          result: {
            filesImported: data.filesImported || 0,
            labelsCreated: data.labelsCreated || 0,
          },
        },
      });

      success("Project imported successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import project";
      dispatch({
        type: "SET_IMPORT_STATE",
        importState: { status: "error", message, error: message },
      });
      error(message, "Import failed");
    }
  };

  const isImporting =
    state.importState.status === "uploading" || importMutation.isPending;

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (
        !nextOpen &&
        (state.importState.status === "uploading" || state.showCharacterWizard)
      ) {
        return;
      }
      onOpenChange(nextOpen);
    },
    [state.importState.status, state.showCharacterWizard, onOpenChange]
  );

  const handleRetry = useCallback(() => {
    dispatch({
      type: "SET_IMPORT_STATE",
      importState: { status: "idle", message: "" },
    });
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return {
    state,
    dispatch,
    fileInputRef,
    importIdRef,
    importSucceededRef,
    didCallOnSuccessRef,
    isImporting,
    importMutation,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleImport,
    handleDialogOpenChange,
    handleRetry,
    handleClose,
  };
}
