import { useEffect } from "react";

export function useWorkspaceTitle(
  projectName: string | undefined,
  documentName?: string,
  isDirty = false
): void {
  useEffect(() => {
    if (!projectName) return;
    const previous = document.title;
    const name = [documentName, projectName, "BranchForge"]
      .filter(Boolean)
      .join(" · ");
    document.title = isDirty ? `* ${name}` : name;
    return () => {
      document.title = previous;
    };
  }, [projectName, documentName, isDirty]);
}
