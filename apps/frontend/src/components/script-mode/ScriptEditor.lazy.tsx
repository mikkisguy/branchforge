import { lazy, Suspense } from "react";
import type React from "react";
import type { ScriptEditorRef } from "./ScriptEditor";
import type { LabelTitleMap } from "@/lib/codemirror/label-title-decoration";

/**
 * Lazy-loaded ScriptEditor with code-split CodeMirror dependencies.
 *
 * All @codemirror/* packages are bundled into a separate chunk
 * and only loaded when script-mode is first opened.
 */
const LazyScriptEditor = lazy(() =>
  import("./ScriptEditor").then((module) => ({
    default: module.ScriptEditor,
  }))
);

const ScriptEditorFallback = () => (
  <div className="flex items-center justify-center h-full w-full text-muted-foreground text-sm">
    Loading editor…
  </div>
);

interface ScriptEditorProps {
  content: string;
  onChange?: (value: string) => void;
  scrollToLine?: number | null;
  readOnly?: boolean;
  isFocusMode?: boolean;
  saveStatus?: import("@/hooks/useAutosave").SaveStatus;
  saveConflict?: boolean;
  onSaveRequest?: () => void;
  labelTitles?: LabelTitleMap;
  /** Controlled line wrap mode. When provided, overrides internal state. */
  lineWrap?: boolean;
  onLineWrapChange?: (wrap: boolean) => void;
  /** Controlled overlays visibility (label titles + image hover previews). When provided, overrides internal state. */
  showOverlays?: boolean;
  onShowOverlaysChange?: (show: boolean) => void;
  /** Project ID for visual statement preview images */
  projectId?: string | null;
  ref?: React.Ref<ScriptEditorRef>;
}

export function ScriptEditor(props: ScriptEditorProps) {
  return (
    <Suspense fallback={<ScriptEditorFallback />}>
      <LazyScriptEditor {...props} />
    </Suspense>
  );
}

export type { ScriptEditorRef };
