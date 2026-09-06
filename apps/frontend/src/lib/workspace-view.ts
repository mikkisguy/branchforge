export type WorkspaceView = "write" | "script" | "flow";

export const WORKSPACE_VIEWS: readonly WorkspaceView[] = [
  "write",
  "script",
  "flow",
];

export const WORKSPACE_VIEW_STORAGE_KEY = "ide:mode";

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return (
    typeof value === "string" &&
    (WORKSPACE_VIEWS as readonly string[]).includes(value)
  );
}
