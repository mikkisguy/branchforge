import { useEffect, useRef } from "react";

export interface WorkspaceDocumentProps {
  initialDocumentId?: string | null;
  onDocumentChange?: (documentId: string | null, isInitial: boolean) => void;
}

export function useWorkspaceDocument(
  onDocumentChange: WorkspaceDocumentProps["onDocumentChange"],
  documentId: string | null,
  isReady: boolean
): void {
  const lastReportedId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (
      !onDocumentChange ||
      !isReady ||
      lastReportedId.current === documentId
    ) {
      return;
    }
    const isInitial = lastReportedId.current === undefined;
    lastReportedId.current = documentId;
    onDocumentChange(documentId, isInitial);
  }, [documentId, isReady, onDocumentChange]);
}
