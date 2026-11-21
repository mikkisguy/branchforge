import { BASE_URL } from "./constants";
import { isWorkspaceView, type WorkspaceView } from "./workspace-view";

export function readWorkspaceLocation(search: string) {
  const params = new URLSearchParams(search);
  const rawView = params.get("view");
  const view = isWorkspaceView(rawView) ? rawView : undefined;
  const document =
    view === "write"
      ? params.get("label")
      : view === "script"
        ? params.get("file")
        : null;

  return {
    projectId: params.get("project") ?? undefined,
    view,
    // Missing means restore the workspace. An empty parameter means no document.
    documentId: document === null ? undefined : document || null,
  };
}

export function workspaceSearch(
  projectId: string,
  view: WorkspaceView,
  documentId?: string | null
): string {
  const params = new URLSearchParams({ project: projectId, view });
  if (documentId !== undefined && view !== "flow") {
    params.set(view === "write" ? "label" : "file", documentId ?? "");
  }
  return `?${params}`;
}

export function workspaceReturnTo(value: string | null): string | null {
  if (value === null) return null;
  // Match the path verbatim before considering query or fragment. This permits
  // only the workspace route under the configured base, including subpath apps.
  const path = value.split(/[?#]/, 1)[0];
  return path === BASE_URL ||
    (BASE_URL !== "/" && path === BASE_URL.slice(0, -1))
    ? value
    : null;
}

export function workspaceLoginPath(returnTo: string): string {
  const destination = workspaceReturnTo(returnTo);
  return `${BASE_URL}login${destination ? `?${new URLSearchParams({ returnTo: destination })}` : ""}`;
}
