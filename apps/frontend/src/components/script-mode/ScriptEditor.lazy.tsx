import { lazy, Suspense, forwardRef } from "react";
import type { ScriptEditorRef } from "./ScriptEditor";

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
}

export const ScriptEditor = forwardRef<ScriptEditorRef, ScriptEditorProps>(
  function LazyScriptEditorWrapper(props, ref) {
    return (
      <Suspense fallback={<ScriptEditorFallback />}>
        <LazyScriptEditor {...props} ref={ref} />
      </Suspense>
    );
  }
);

export type { ScriptEditorRef };
