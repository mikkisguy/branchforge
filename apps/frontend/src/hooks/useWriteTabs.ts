import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { PublicLabel } from "@branchforge/shared";
import type { EditorTabBarItem } from "@/components/ide-shared";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from "@/hooks/useLocalStorage";

interface UseWriteTabsProps {
  projectId: string | undefined;
  labels: PublicLabel[];
  activeLabelId: string | null;
  setActiveLabelId: (id: string | null) => void;
  isLoadingLabels: boolean;
}

interface UseWriteTabsReturn {
  openTabs: string[];
  tabItems: EditorTabBarItem[];
  selectLabelTab: (labelId: string) => void;
  handleCloseTab: (event: MouseEvent | KeyboardEvent, labelId: string) => void;
}

export function useWriteTabs({
  projectId,
  labels,
  activeLabelId,
  setActiveLabelId,
  isLoadingLabels,
}: UseWriteTabsProps): UseWriteTabsReturn {
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    if (activeLabelId) {
      return [activeLabelId];
    }

    return [];
  });

  const [hydratedTabsProjectId, setHydratedTabsProjectId] = useState<
    string | undefined
  >(undefined);

  const prevProjectIdRef = useRef<string | undefined>(undefined);
  const activeLabelIdRef = useRef<string | null>(null);

  const tabsStorageKey = useMemo(() => {
    if (!projectId) {
      return null;
    }

    return getPrefixedStorageKey(`write:open-tabs:${projectId}`);
  }, [projectId]);

  const activeTabStorageKey = useMemo(() => {
    if (!projectId) {
      return null;
    }

    return getPrefixedStorageKey(`write:active-tab:${projectId}`);
  }, [projectId]);

  const labelIdSet = useMemo(() => new Set(labels.map((l) => l.id)), [labels]);

  useEffect(() => {
    if (
      prevProjectIdRef.current !== undefined &&
      prevProjectIdRef.current !== projectId
    ) {
      setOpenTabs([]);
      setHydratedTabsProjectId(undefined);
    }

    prevProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    activeLabelIdRef.current = activeLabelId;
  }, [activeLabelId]);

  const selectLabelTab = useCallback(
    (labelId: string) => {
      setOpenTabs((prev) => {
        if (prev.includes(labelId)) {
          return prev;
        }

        return [...prev, labelId];
      });

      setActiveLabelId(labelId);
    },
    [setActiveLabelId]
  );

  const handleCloseTab = useCallback(
    (event: MouseEvent | KeyboardEvent, labelId: string) => {
      event.stopPropagation();

      setOpenTabs((prev) => {
        const tabIndex = prev.indexOf(labelId);
        const nextTabs = prev.filter((tabId) => tabId !== labelId);

        if (nextTabs.length === 0) {
          setActiveLabelId(null);
          return nextTabs;
        }

        const currentActiveId = activeLabelIdRef.current;
        if (labelId === currentActiveId) {
          const fallbackTab = prev[tabIndex - 1] ?? nextTabs[0] ?? null;
          setActiveLabelId(fallbackTab);
        }

        return nextTabs;
      });
    },
    [setActiveLabelId]
  );

  useEffect(() => {
    if (!tabsStorageKey || !projectId) {
      return;
    }

    if (hydratedTabsProjectId !== projectId) {
      return;
    }

    writeLocalStorageItem(tabsStorageKey, JSON.stringify(openTabs));
  }, [hydratedTabsProjectId, openTabs, projectId, tabsStorageKey]);

  useEffect(() => {
    if (!activeTabStorageKey || !projectId) {
      return;
    }

    if (hydratedTabsProjectId !== projectId) {
      return;
    }

    if (activeLabelId && labelIdSet.has(activeLabelId)) {
      writeLocalStorageItem(activeTabStorageKey, activeLabelId);
      return;
    }

    removeLocalStorageItem(activeTabStorageKey);
  }, [
    activeLabelId,
    activeTabStorageKey,
    hydratedTabsProjectId,
    labelIdSet,
    projectId,
  ]);

  useEffect(() => {
    if (isLoadingLabels || !projectId || hydratedTabsProjectId === projectId) {
      return;
    }

    const savedTabsRaw = tabsStorageKey
      ? readLocalStorageItem(tabsStorageKey)
      : null;
    const savedActiveTabId = activeTabStorageKey
      ? readLocalStorageItem(activeTabStorageKey)
      : null;

    let nextOpenTabs: string[] = [];
    if (savedTabsRaw) {
      try {
        const parsedTabs = JSON.parse(savedTabsRaw) as unknown;
        if (Array.isArray(parsedTabs)) {
          nextOpenTabs = parsedTabs.filter(
            (id): id is string => typeof id === "string" && labelIdSet.has(id)
          );
        }
      } catch {
        // Ignore invalid persisted payload.
      }
    }

    let nextActiveLabelId: string | null;

    if (activeLabelId && labelIdSet.has(activeLabelId)) {
      nextActiveLabelId = activeLabelId;
    } else if (savedActiveTabId && labelIdSet.has(savedActiveTabId)) {
      nextActiveLabelId = savedActiveTabId;
    } else {
      nextActiveLabelId = nextOpenTabs[0] ?? labels[0]?.id ?? null;
    }

    if (nextActiveLabelId && !nextOpenTabs.includes(nextActiveLabelId)) {
      nextOpenTabs = [...nextOpenTabs, nextActiveLabelId];
    }

    setOpenTabs(nextOpenTabs);

    if (nextActiveLabelId !== activeLabelId) {
      setActiveLabelId(nextActiveLabelId);
    }

    setHydratedTabsProjectId(projectId);
  }, [
    activeLabelId,
    activeTabStorageKey,
    hydratedTabsProjectId,
    isLoadingLabels,
    labelIdSet,
    projectId,
    setActiveLabelId,
    tabsStorageKey,
    labels,
  ]);

  useEffect(() => {
    if (!activeLabelId) {
      return;
    }

    const isKnownLabel = labels.some((label) => label.id === activeLabelId);
    if (!isKnownLabel) {
      return;
    }

    setOpenTabs((prev) => {
      if (prev.includes(activeLabelId)) {
        return prev;
      }

      return [...prev, activeLabelId];
    });
  }, [activeLabelId, labels]);

  useEffect(() => {
    setOpenTabs((prev) => {
      const nextTabs = prev.filter((tabId) => labelIdSet.has(tabId));
      return nextTabs.length === prev.length ? prev : nextTabs;
    });
  }, [labelIdSet]);

  const tabItems = useMemo<EditorTabBarItem[]>(() => {
    const labelsById = new Map(labels.map((label) => [label.id, label]));

    return openTabs.flatMap((tabId) => {
      const label = labelsById.get(tabId);
      if (!label) {
        return [];
      }

      return [
        {
          id: label.id,
          title: label.title,
          meta: String(label.labelNumber ?? 0).padStart(2, "0"),
          closeLabel: `Close ${label.title}`,
        },
      ];
    });
  }, [labels, openTabs]);

  return {
    openTabs,
    tabItems,
    selectLabelTab,
    handleCloseTab,
  };
}
