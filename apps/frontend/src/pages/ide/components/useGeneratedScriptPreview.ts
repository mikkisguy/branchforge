import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExportPreview } from "@/hooks/useExportPreview";
import { GENERATED_PREVIEW_BASENAMES } from "@/lib/generated-preview-files";

export function useGeneratedScriptPreview(
  projectId: string | undefined,
  setActiveLabelId: (labelId: string | null) => void,
  showErrorToast: (message: string, title: string) => void
) {
  const [generatedFileName, setGeneratedFileName] = useState<string | null>(
    null
  );
  const previewQuery = useExportPreview(projectId);
  const previewFile = previewQuery.data?.files.find(
    (file) => file.fileName === generatedFileName
  );
  const generatedContent =
    previewFile && !previewFile.isEmpty ? previewFile.content : null;
  const generatedPreview = generatedFileName
    ? {
        fileName: generatedFileName,
        content: generatedContent,
        emptyReason:
          generatedContent === null && previewQuery.data
            ? (previewFile?.emptyReason ?? "No managed declarations to export")
            : null,
      }
    : null;

  const handleGeneratedFileSelect = useCallback(
    (fileName: string) => {
      const file = previewQuery.data?.files.find(
        (f) => f.fileName === fileName
      );
      if (!file || file.isEmpty) return;

      setGeneratedFileName(fileName);
      setActiveLabelId(null);
    },
    [previewQuery.data, setActiveLabelId]
  );

  const generatedFiles = useMemo(
    () =>
      GENERATED_PREVIEW_BASENAMES.map((fileName) => {
        const file = previewQuery.data?.files.find(
          (entry) => entry.fileName === fileName
        );
        return (
          file ?? {
            fileName,
            isEmpty: true,
            emptyReason: previewQuery.isError
              ? "Failed to load generated preview"
              : previewQuery.data
                ? "No managed declarations to export"
                : "Loading generated preview…",
          }
        );
      }),
    [previewQuery.data, previewQuery.isError]
  );

  const previewErrorShownRef = useRef(false);
  useEffect(() => {
    if (previewQuery.isError) {
      if (!previewErrorShownRef.current && !generatedFileName) {
        showErrorToast("Failed to load generated preview", "Preview Error");
      }
      previewErrorShownRef.current = true;
      return;
    }
    // Allow a later failure to toast again after recovery.
    previewErrorShownRef.current = false;
  }, [generatedFileName, previewQuery.isError, showErrorToast]);

  return {
    generatedFileName,
    setGeneratedFileName,
    generatedFiles,
    generatedPreview,
    handleGeneratedFileSelect,
    generatedPreviewError: previewQuery.isError
      ? { retry: previewQuery.refetch, isRetrying: previewQuery.isFetching }
      : null,
  };
}
