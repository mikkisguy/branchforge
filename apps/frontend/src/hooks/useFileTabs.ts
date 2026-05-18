import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  Dispatch,
  SetStateAction,
} from "react";
import type { EditorTabBarItem } from "@/components/ide-shared";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from "@/hooks/useLocalStorage";
import type { ProjectFileNode } from "./useProjectFiles";

interface SelectFileOptions {
  notify?: boolean;
}

interface UseFileTabsProps {
  projectId: string | undefined;
  projectFiles: ProjectFileNode[];
  isLoadingFiles: boolean;
  isResettingRef?: MutableRefObject<boolean>;
  onFileSelect: (fileId: string) => Promise<boolean> | boolean;
  onFileActivated?: (fileId: string) => void;
  onNoTabsRemaining?: () => void;
}

interface UseFileTabsReturn {
  openTabs: string[];
  activeFileId: string | null;
  setActiveFileId: Dispatch<SetStateAction<string | null>>;
  tabItems: EditorTabBarItem[];
  selectFileTab: (
    fileId: string,
    options?: SelectFileOptions
  ) => Promise<boolean>;
  handleCloseFileTab: (
    event: MouseEvent | KeyboardEvent,
    fileId: string
  ) => void;
  clearTabsState: () => void;
}

export function useFileTabs({
  projectId,
  projectFiles,
  isLoadingFiles,
  isResettingRef,
  onFileSelect,
  onFileActivated,
  onNoTabsRemaining,
}: UseFileTabsProps): UseFileTabsReturn {
  const [openTabs, setOpenTabs] = useState<string[]>([]);

  /**
   * Low-level state setter for the active file ID.
   *
   * WARNING: This bypasses validation and callbacks that {@link selectFileTab} performs.
   * Specifically, it does NOT check:
   * - File existence in projectFiles
   * - onFileSelect gating (may allow selecting files that should be blocked)
   * - onFileActivated callback (activation side effects are skipped)
   *
   * PREFER: Use {@link selectFileTab} for normal file activation to ensure validation
   * and proper callback execution.
   *
   * USE CASE: Only use {@link setActiveFileId} directly for special cases like:
   * - Resetting state during project switching
   * - Direct state updates where validation is intentionally skipped
   */
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const activeFileIdRef = useRef(activeFileId);

  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  const [hydratedTabsProjectId, setHydratedTabsProjectId] = useState<
    string | undefined
  >(undefined);

  const tabsStorageKey = projectId
    ? getPrefixedStorageKey(`script:open-tabs:${projectId}`)
    : null;
  const activeFileStorageKey = projectId
    ? getPrefixedStorageKey(`script:active-file:${projectId}`)
    : null;

  const selectFileTab = useCallback(
    async (fileId: string, options: SelectFileOptions = {}) => {
      const file = projectFiles.find(
        (projectFile) => projectFile.id === fileId
      );
      if (!file) {
        return false;
      }

      const switched = await onFileSelect(fileId);
      if (!switched) {
        return false;
      }

      setActiveFileId(fileId);
      setOpenTabs((prev) => {
        if (prev.includes(fileId)) {
          return prev;
        }
        return [...prev, fileId];
      });

      if (options.notify !== false) {
        onFileActivated?.(fileId);
      }

      return true;
    },
    [onFileActivated, onFileSelect, projectFiles]
  );

  const handleCloseFileTab = useCallback(
    (event: MouseEvent | KeyboardEvent, fileId: string) => {
      event.stopPropagation();

      const isActive = fileId === activeFileId;
      const nextTabs = openTabs.filter((id) => id !== fileId);
      setOpenTabs(nextTabs);

      if (!isActive) {
        return;
      }

      if (nextTabs.length === 0) {
        setActiveFileId(null);
        onNoTabsRemaining?.();
        return;
      }

      const index = openTabs.indexOf(fileId);
      const fallbackFileId = openTabs[index - 1] ?? nextTabs[0];
      void selectFileTab(fallbackFileId);
    },
    [activeFileId, onNoTabsRemaining, openTabs, selectFileTab]
  );

  const tabItems = useMemo<EditorTabBarItem[]>(() => {
    const items: EditorTabBarItem[] = [];
    for (const tabId of openTabs) {
      const file = projectFiles.find((projectFile) => projectFile.id === tabId);
      if (file !== undefined) {
        const fileName = file.filePath.split("/").pop() || file.filePath;
        const fileKind = file.fileType === "SETTINGS" ? "Settings" : "Story";

        items.push({
          id: file.id,
          title: fileName,
          meta: fileKind,
          closeLabel: `Close ${fileName}`,
        });
      }
    }
    return items;
  }, [openTabs, projectFiles]);

  useEffect(() => {
    if (tabsStorageKey && hydratedTabsProjectId === projectId) {
      writeLocalStorageItem(tabsStorageKey, JSON.stringify(openTabs));
    }
  }, [openTabs, projectId, tabsStorageKey, hydratedTabsProjectId]);

  useEffect(() => {
    if (!activeFileStorageKey || hydratedTabsProjectId !== projectId) {
      return;
    }

    if (activeFileId) {
      writeLocalStorageItem(activeFileStorageKey, activeFileId);
    } else {
      removeLocalStorageItem(activeFileStorageKey);
    }
  }, [activeFileId, activeFileStorageKey, hydratedTabsProjectId, projectId]);

  useEffect(() => {
    if (
      !projectId ||
      isLoadingFiles ||
      hydratedTabsProjectId === projectId ||
      isResettingRef?.current
    ) {
      return;
    }

    let cancelled = false;

    const hydrateTabs = async () => {
      // Intentionally yield to next microtask to allow state to settle
      await Promise.resolve();

      if (cancelled || isResettingRef?.current) {
        return;
      }

      const fileIds = new Set(projectFiles.map((file) => file.id));
      const savedTabsRaw = tabsStorageKey
        ? readLocalStorageItem(tabsStorageKey)
        : null;

      let nextOpenTabs: string[] = [];
      if (savedTabsRaw) {
        try {
          const parsedTabs = JSON.parse(savedTabsRaw) as unknown;
          if (Array.isArray(parsedTabs)) {
            nextOpenTabs = parsedTabs.filter(
              (id): id is string => typeof id === "string" && fileIds.has(id)
            );
          }
        } catch {
          // Invalid JSON; ignore and continue.
        }
      }

      const savedActiveFileId = activeFileStorageKey
        ? readLocalStorageItem(activeFileStorageKey)
        : null;
      const resolvedActiveFileId =
        savedActiveFileId && fileIds.has(savedActiveFileId)
          ? savedActiveFileId
          : activeFileIdRef.current && fileIds.has(activeFileIdRef.current)
            ? activeFileIdRef.current
            : null;

      if (
        resolvedActiveFileId &&
        !nextOpenTabs.includes(resolvedActiveFileId)
      ) {
        nextOpenTabs = [...nextOpenTabs, resolvedActiveFileId];
      }

      if (cancelled) {
        return;
      }

      setOpenTabs(nextOpenTabs);

      try {
        if (
          resolvedActiveFileId &&
          resolvedActiveFileId !== activeFileIdRef.current
        ) {
          await selectFileTab(resolvedActiveFileId);
        }
      } finally {
        if (!cancelled) {
          setHydratedTabsProjectId(projectId);
        }
      }
    };

    void hydrateTabs();

    return () => {
      cancelled = true;
    };
  }, [
    activeFileStorageKey,
    hydratedTabsProjectId,
    isLoadingFiles,
    isResettingRef,
    projectFiles,
    projectId,
    selectFileTab,
    tabsStorageKey,
  ]);

  useEffect(() => {
    if (
      !activeFileId ||
      !projectFiles.some((file) => file.id === activeFileId)
    ) {
      return;
    }

    setOpenTabs((prev) => {
      if (prev.includes(activeFileId)) {
        return prev;
      }
      return [...prev, activeFileId];
    });
  }, [activeFileId, projectFiles]);

  useEffect(() => {
    const fileIds = new Set(projectFiles.map((file) => file.id));
    setOpenTabs((prev) => {
      const nextTabs = prev.filter((tabId) => fileIds.has(tabId));
      return nextTabs.length === prev.length ? prev : nextTabs;
    });
  }, [projectFiles]);

  const clearTabsState = useCallback(() => {
    setHydratedTabsProjectId(undefined);
    setOpenTabs([]);
    setActiveFileId(null);
  }, []);

  return {
    openTabs,
    activeFileId,
    setActiveFileId,
    tabItems,
    selectFileTab,
    handleCloseFileTab,
    clearTabsState,
  };
}
