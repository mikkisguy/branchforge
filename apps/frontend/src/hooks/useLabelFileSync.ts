import { useEffect, useRef } from "react";
import { sanitizeLabelName, RENPY_LABEL_REGEX } from "@branchforge/shared";
import type { ProjectFileNode } from "./useProjectFiles";

interface UseLabelFileSyncProps {
  /**
   * Project files array. Should be memoized (useMemo) to prevent unnecessary re-runs.
   */
  projectFiles: ProjectFileNode[];
  activeLabelId: string | null;
  /**
   * Callback to select a file. Should be memoized (useCallback) to prevent unnecessary re-runs.
   */
  onFileSelect: (fileId: string) => Promise<boolean> | boolean;
  /**
   * Callback to set scroll to line. Should be memoized (useCallback) to prevent unnecessary re-runs.
   */
  onSetScrollToLine: (line: number | null) => void;
}

export function findLabelLineNumber(
  fileContent: string,
  labelName: string
): number | null {
  const lines = fileContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const labelMatch = line.match(RENPY_LABEL_REGEX);
    if (labelMatch) {
      const extractedLabel = labelMatch[1];
      if (extractedLabel === labelName) {
        return i + 1;
      }
    }
  }

  return null;
}

export function useLabelFileSync({
  projectFiles,
  activeLabelId,
  onFileSelect,
  onSetScrollToLine,
}: UseLabelFileSyncProps): void {
  const onFileSelectRef = useRef(onFileSelect);
  const onSetScrollToLineRef = useRef(onSetScrollToLine);

  useEffect(() => {
    onFileSelectRef.current = onFileSelect;
    onSetScrollToLineRef.current = onSetScrollToLine;
  }, [onFileSelect, onSetScrollToLine]);

  useEffect(() => {
    if (!activeLabelId) {
      onSetScrollToLineRef.current(null);
      return;
    }

    const fileWithLabel = projectFiles.find((file) =>
      file.labels.some((label) => label.id === activeLabelId)
    );
    if (!fileWithLabel) {
      onSetScrollToLineRef.current(null);
      return;
    }

    const labelMetadata = fileWithLabel.labels.find(
      (label) => label.id === activeLabelId
    );
    if (!labelMetadata) {
      onSetScrollToLineRef.current(null);
      return;
    }

    const lineNumber = findLabelLineNumber(
      fileWithLabel.content,
      labelMetadata.labelName ?? sanitizeLabelName(labelMetadata.title)
    );
    let cancelled = false;

    void (async () => {
      try {
        const switched = await onFileSelectRef.current(fileWithLabel.id);
        if (!switched || cancelled) {
          return;
        }
        onSetScrollToLineRef.current(lineNumber);
      } catch (error) {
        console.error("Failed to select file:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeLabelId, projectFiles]);
}
