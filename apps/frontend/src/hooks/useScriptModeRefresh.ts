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
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    if (!projectId || isLoadingFiles || hasRefreshedRef.current) {
      return;
    }

    (async () => {
      try {
        hasRefreshedRef.current = true;
        await refreshFiles();
      } catch (error) {
        hasRefreshedRef.current = false;
        console.error("Failed to refresh files:", error);
      }
    })();
  }, [isLoadingFiles, projectId, refreshFiles]);

  const resetRefreshState = useCallback(() => {
    hasRefreshedRef.current = false;
  }, []);

  return { resetRefreshState };
}
