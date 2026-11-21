import {
  useCallback,
  useEffect,
  useEffectEvent,
  type RefObject,
  useRef,
  useState,
} from "react";
import {
  useBlocker,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { getPrefixedStorageKey } from "@/hooks/useLocalStorage";
import { flushModeBeforeTransition } from "@/lib/editor-sync-coordinator";
import {
  readWorkspaceLocation,
  workspaceSearch,
} from "@/lib/workspace-location";
import {
  readWorkspaceSession,
  writeWorkspaceSession,
} from "@/lib/workspace-session";
import {
  isWorkspaceView,
  WORKSPACE_VIEW_STORAGE_KEY,
  type WorkspaceView,
} from "@/lib/workspace-view";

const MODE_KEY = getPrefixedStorageKey(WORKSPACE_VIEW_STORAGE_KEY);

export function isEditorView(view: WorkspaceView): view is "write" | "script" {
  return view !== "flow";
}

export function useWorkspaceNavigation(
  projectId: string | undefined,
  flushingRef: RefObject<boolean>,
  showErrorToast: (message: string, title: string) => void
) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const linked = readWorkspaceLocation(location.search);
  const [defaultView] = useState<WorkspaceView>(() => {
    const saved = readWorkspaceSession(MODE_KEY);
    return isWorkspaceView(saved) ? saved : "write";
  });
  const view = linked.view ?? defaultView;

  // App document selections are already applied in the editor. Browser history
  // visits must hydrate again so the URL wins over the last active document.
  const [entry, setEntry] = useState(() => ({
    pathname: location.pathname,
    search: location.search,
    locationKey: location.key,
    editorKey: location.key,
    initialDocumentId: linked.documentId,
  }));
  if (entry.locationKey !== location.key) {
    const sameWorkspace =
      entry.pathname === location.pathname && entry.search === location.search;
    const keepEditor =
      sameWorkspace ||
      (navigationType !== "POP" &&
        location.state?.editorKey === entry.editorKey);
    setEntry({
      pathname: location.pathname,
      search: location.search,
      locationKey: location.key,
      editorKey: keepEditor ? entry.editorKey : location.key,
      initialDocumentId: keepEditor
        ? entry.initialDocumentId
        : linked.documentId,
    });
  }

  useEffect(() => {
    if (!linked.view) return;
    writeWorkspaceSession(MODE_KEY, linked.view);
  }, [linked.view]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation, historyAction }) =>
      historyAction === "POP" &&
      isEditorView(view) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
  );

  const warnSaveFailed = useEffectEvent(() => {
    showErrorToast(
      "Could not save pending edits. Resolve the save error before navigating.",
      "Navigation blocked"
    );
  });

  const historySaveRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (blocker.state !== "blocked" || !isEditorView(view)) return;

    let save = historySaveRef.current;
    if (!save) {
      if (flushingRef.current) {
        blocker.reset();
        return;
      }

      flushingRef.current = true;
      save = flushModeBeforeTransition(view)
        .catch(() => false)
        .finally(() => {
          historySaveRef.current = null;
          flushingRef.current = false;
        });
      historySaveRef.current = save;
    }

    // Repeated Back requests can replace the blocker while the same save
    // runs. The latest blocked destination receives the result.
    let active = true;
    void save.then((saved) => {
      if (!active) return;
      if (saved) {
        blocker.proceed();
      } else {
        blocker.reset();
        warnSaveFailed();
      }
    });
    return () => {
      active = false;
    };
  }, [blocker, flushingRef, view]);

  const goToWorkspace = (
    nextProjectId: string | undefined,
    nextView: WorkspaceView,
    replace = false
  ) =>
    navigate(
      {
        search: nextProjectId
          ? workspaceSearch(nextProjectId, nextView)
          : `?view=${nextView}`,
      },
      { replace }
    );

  const reportDocument = useCallback(
    (documentId: string | null, isInitial: boolean) => {
      if (!projectId) return;
      const search = workspaceSearch(projectId, view, documentId);
      if (search === location.search) return;
      void navigate(
        { search, hash: location.hash },
        {
          replace: isInitial,
          state: { editorKey: entry.editorKey },
        }
      );
    },
    [entry.editorKey, location.hash, location.search, navigate, projectId, view]
  );

  // Commit the project and view before mounting an editor. Its document can
  // load later, and a failed document request must not leave a bare URL.
  const scopeSearch = projectId ? workspaceSearch(projectId, view) : null;
  const isResolvingScope =
    scopeSearch !== null &&
    (linked.projectId !== projectId ||
      linked.view !== view ||
      (view === "flow" && scopeSearch !== location.search));
  useEffect(() => {
    if (isResolvingScope && scopeSearch !== null) {
      void navigate(
        { search: scopeSearch, hash: location.hash },
        { replace: true }
      );
    }
  }, [isResolvingScope, location.hash, navigate, scopeSearch]);

  return {
    view,
    linkedProjectId: linked.projectId,
    entry,
    isResolvingScope,
    isHistoryTransitionPending: blocker.state !== "unblocked",
    goToWorkspace,
    reportDocument,
  };
}
