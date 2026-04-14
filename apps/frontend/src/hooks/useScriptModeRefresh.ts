import { useCallback, useEffect, useRef } from "react";

interface UseScriptModeRefreshProps {
  projectId: string | undefined;
  isLoadingFiles: boolean;
  refreshFiles: () => Promise<unknown>;
}

interface UseScriptModeRefreshReturn {
  resetRefreshState: () => void;
}

export function useScriptModeRefresh({
  projectId,
  isLoadingFiles,
  refreshFiles,
}: UseScriptModeRefreshProps): UseScriptModeRefreshReturn {
  const hasRefreshedRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!projectId || isLoadingFiles) {
      return;
    }

    if (hasRefreshedRef.current.get(projectId)) {
      return;
    }

    (async () => {
      try {
        hasRefreshedRef.current.set(projectId, true);
        await refreshFiles();
      } catch (error) {
        hasRefreshedRef.current.delete(projectId);
        console.error("Failed to refresh files:", error);
      }
    })();
  }, [isLoadingFiles, projectId, refreshFiles]);

  const resetRefreshState = useCallback(() => {
    hasRefreshedRef.current.clear();
  }, []);

  return { resetRefreshState };
}
