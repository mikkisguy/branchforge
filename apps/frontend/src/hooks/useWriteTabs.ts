import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { PublicLabel } from "@branchforge/shared";
import type { EditorTabBarItem } from "@/components/ide-shared";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from "@/hooks/useLocalStorage";

interface WriteTabsState {
  openTabs: string[];
  hydratedTabsProjectId: string | undefined;
  nextActiveLabelId: string | null | undefined;
}

type WriteTabsAction =
  | {
      type: "SET_TABS_AND_HYDRATION";
      openTabs: string[];
      hydratedTabsProjectId: string;
    }
  | { type: "CLEAR_TABS_AND_HYDRATION" }
  | { type: "CLOSE_TAB"; labelId: string; isActiveTab: boolean }
  | { type: "ADD_TAB"; labelId: string }
  | { type: "PROJECT_CHANGE" }
  | { type: "CLEAR_NEXT_ACTIVE" }
  | { type: "PRUNE_TABS"; openTabs: string[] };

function writeTabsReducer(
  state: WriteTabsState,
  action: WriteTabsAction
): WriteTabsState {
  switch (action.type) {
    case "SET_TABS_AND_HYDRATION":
      return {
        openTabs: action.openTabs,
        hydratedTabsProjectId: action.hydratedTabsProjectId,
        nextActiveLabelId: undefined,
      };

    case "CLEAR_TABS_AND_HYDRATION":
      return {
        openTabs: [],
        hydratedTabsProjectId: undefined,
        nextActiveLabelId: undefined,
      };

    case "CLOSE_TAB": {
      const nextTabs = state.openTabs.filter(
        (tabId) => tabId !== action.labelId
      );
      let nextActiveLabelId: string | null | undefined = undefined;

      if (nextTabs.length === 0) {
        nextActiveLabelId = null;
      } else if (action.isActiveTab) {
        const tabIndex = state.openTabs.indexOf(action.labelId);
        nextActiveLabelId = state.openTabs[tabIndex - 1] ?? nextTabs[0] ?? null;
      }

      return { ...state, openTabs: nextTabs, nextActiveLabelId };
    }

    case "ADD_TAB":
      return {
        ...state,
        openTabs: state.openTabs.includes(action.labelId)
          ? state.openTabs
          : [...state.openTabs, action.labelId],
      };

    case "PROJECT_CHANGE":
      return {
        openTabs: [],
        hydratedTabsProjectId: undefined,
        nextActiveLabelId: undefined,
      };

    case "CLEAR_NEXT_ACTIVE":
      return { ...state, nextActiveLabelId: undefined };

    case "PRUNE_TABS":
      return { ...state, openTabs: action.openTabs };

    default:
      return state;
  }
}

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
  const [tabsState, dispatch] = useReducer(writeTabsReducer, {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    openTabs: activeLabelId ? [activeLabelId] : [],
    hydratedTabsProjectId: undefined,
    nextActiveLabelId: undefined,
  });

  const { openTabs, hydratedTabsProjectId } = tabsState;

  const prevProjectIdRef = useRef<string | undefined>(undefined);
  const activeLabelIdRef = useRef<string | null>(null);

  const tabsStorageKey = useMemo(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
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

  // react-doctor-disable-next-line react-doctor/no-event-handler
  const labelIdSet = useMemo(() => new Set(labels.map((l) => l.id)), [labels]);

  useEffect(() => {
    if (
      prevProjectIdRef.current !== undefined &&
      prevProjectIdRef.current !== projectId
    ) {
      dispatch({ type: "PROJECT_CHANGE" });
    }

    prevProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    activeLabelIdRef.current = activeLabelId;
  }, [activeLabelId]);

  useEffect(() => {
    if (tabsState.nextActiveLabelId !== undefined) {
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent
      setActiveLabelId(tabsState.nextActiveLabelId);
      dispatch({ type: "CLEAR_NEXT_ACTIVE" });
    }
  }, [tabsState.nextActiveLabelId, setActiveLabelId]);

  const selectLabelTab = useCallback(
    (labelId: string) => {
      dispatch({ type: "ADD_TAB", labelId });
      setActiveLabelId(labelId);
    },
    [setActiveLabelId]
  );

  const handleCloseTab = useCallback(
    (event: MouseEvent | KeyboardEvent, labelId: string) => {
      event.stopPropagation();
      const isActiveTab = labelId === activeLabelIdRef.current;
      dispatch({ type: "CLOSE_TAB", labelId, isActiveTab });
    },
    []
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

    // react-doctor-disable-next-line react-doctor/no-event-handler
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

    dispatch({
      type: "SET_TABS_AND_HYDRATION",
      openTabs: nextOpenTabs,
      hydratedTabsProjectId: projectId,
    });

    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (nextActiveLabelId !== activeLabelId) {
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent
      setActiveLabelId(nextActiveLabelId);
    }
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

    dispatch({ type: "ADD_TAB", labelId: activeLabelId });
  }, [activeLabelId, labels]);

  useEffect(() => {
    const nextTabs = openTabs.filter((tabId) => labelIdSet.has(tabId));
    if (nextTabs.length !== openTabs.length) {
      dispatch({
        type: "PRUNE_TABS",
        openTabs: nextTabs,
      });
    }
  }, [labelIdSet, openTabs]);

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
          meta: label.fileName.replace(/\.[^.]+$/, ""),
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
