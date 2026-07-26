import CodeMirror from "@uiw/react-codemirror";
import {
  useMemo,
  useCallback,
  useImperativeHandle,
  useEffect,
  useState,
  useRef,
} from "react";
import type React from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { EditorView } from "@codemirror/view";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { renPy } from "../../../lib/codemirror/renpy";
import {
  renPyBaseTheme,
  renPySyntaxHighlighting,
} from "../../../lib/codemirror/renpy-theme";
import { stripBOM } from "../../../lib/codemirror/utils";
import { useEditorCursor } from "../../../lib/codemirror/useEditorCursor";
import {
  labelTitleExtension,
  setLabelTitlesEffect,
  type LabelTitleMap,
} from "@/lib/codemirror/label-title-decoration";
import {
  visualPreviewExtension,
  setVisualPreviewHandlersEffect,
  type ParsedVisualStatement,
} from "@/lib/codemirror/visual-preview-decoration";
import {
  VisualPreviewModal,
  type VisualPreviewSelection,
} from "@/components/project-images/VisualPreviewModal";
import { useVisualPreviewLookup } from "@/hooks/useVisualPreviewLookup";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorage";
import type { SaveStatus } from "@/hooks/useAutosave";
import { createHighlightExtension } from "./ScriptEditorHighlight";
import { useScriptEditorController } from "./useScriptEditorController";
import { ScriptEditorToolbar } from "./ScriptEditorToolbar";

export interface ScriptEditorRef {
  focus: () => void;
}

interface ScriptEditorProps {
  content: string;
  onChange?: (value: string) => void;
  scrollToLine?: number | null;
  readOnly?: boolean;
  isFocusMode?: boolean;
  saveStatus?: SaveStatus;
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
}

export const ScriptEditor = function ScriptEditor({
  content,
  onChange,
  scrollToLine,
  readOnly = false,
  isFocusMode = false,
  saveStatus,
  saveConflict,
  onSaveRequest,
  labelTitles,
  lineWrap: propsLineWrap,
  onLineWrapChange,
  showOverlays: propsShowOverlays,
  onShowOverlaysChange,
  projectId,
  ref,
}: ScriptEditorProps & { ref?: React.Ref<ScriptEditorRef> }) {
  const [internalLineWrap, setInternalLineWrap] = useLocalStorageBoolean(
    "script:line-wrap",
    false
  );
  const lineWrap = propsLineWrap ?? internalLineWrap;
  const setLineWrap = onLineWrapChange ?? setInternalLineWrap;
  const lineWrapExtension = useMemo(
    () => (lineWrap ? EditorView.lineWrapping : []),
    [lineWrap]
  );

  const cleanContent = useMemo(() => stripBOM(content), [content]);

  const [internalShowOverlays, setInternalShowOverlays] =
    useLocalStorageBoolean("script:show-label-titles", true);
  const showOverlays = propsShowOverlays ?? internalShowOverlays;
  const setShowOverlays = onShowOverlaysChange ?? setInternalShowOverlays;

  const [previewSelection, setPreviewSelection] =
    useState<VisualPreviewSelection | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const { getImageForTarget } = useVisualPreviewLookup(projectId, {
    enabled: !!projectId,
  });

  const openVisualPreview = useCallback((parsed: ParsedVisualStatement) => {
    setPreviewSelection({
      statementType: parsed.type,
      target: parsed.target,
    });
    setIsPreviewModalOpen(true);
  }, []);

  // Keep latest handlers in refs so we can dispatch them on editor create
  // (useEffect often runs while the lazy ScriptEditor fallback is still showing).
  const getImageForTargetRef = useRef(getImageForTarget);
  const openVisualPreviewRef = useRef(openVisualPreview);
  const hoverPreviewsEnabledRef = useRef(showOverlays);
  useEffect(() => {
    getImageForTargetRef.current = getImageForTarget;
  });
  useEffect(() => {
    openVisualPreviewRef.current = openVisualPreview;
  });
  useEffect(() => {
    hoverPreviewsEnabledRef.current = showOverlays;
  });

  const { highlightStateField, setHighlightEffect } = useMemo(
    () => createHighlightExtension(),
    []
  );

  const { editorViewRef, handleCreateEditor } = useScriptEditorController({
    scrollToLine,
    labelTitles,
    showOverlays,
    setHighlightEffect,
  });

  const dispatchVisualPreviewHandlers = useCallback(
    (view: EditorView) => {
      if (!projectId) {
        return;
      }

      view.dispatch({
        effects: [
          setVisualPreviewHandlersEffect.of({
            getImageForTarget: (target) => {
              const image = getImageForTargetRef.current(target);
              return image ? { tooltipUrl: image.tooltipUrl } : undefined;
            },
            onOpenPreview: (parsed) => {
              openVisualPreviewRef.current(parsed);
            },
            hoverPreviewsEnabled: hoverPreviewsEnabledRef.current,
          }),
        ],
      });
    },
    [projectId]
  );

  const handleCreateEditorWithPreviews = useCallback(
    (view: EditorView) => {
      handleCreateEditor(view);
      dispatchVisualPreviewHandlers(view);
    },
    [handleCreateEditor, dispatchVisualPreviewHandlers]
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editorViewRef.current?.focus();
      },
    }),
    [editorViewRef]
  );

  const toggleLineWrap = useCallback(
    () => setLineWrap(!lineWrap),
    [setLineWrap, lineWrap]
  );

  const { cursorPosition, selectionInfo, totalLines, updateListener } =
    useEditorCursor({ initialContent: cleanContent });

  const extensions = useMemo(
    () =>
      [
        renPy,
        renPyBaseTheme,
        renPySyntaxHighlighting,
        lineWrapExtension,
        updateListener,
        highlightStateField,
        labelTitleExtension,
        projectId ? visualPreviewExtension : [],
        search({}),
        highlightSelectionMatches(),
      ].flat(),
    [lineWrapExtension, updateListener, highlightStateField, projectId]
  );

  useEffect(() => {
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        effects: [
          setLabelTitlesEffect.of(
            showOverlays && labelTitles ? labelTitles : new Map()
          ),
        ],
      });
    }
  }, [editorViewRef, labelTitles, showOverlays]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }
    dispatchVisualPreviewHandlers(view);
  }, [
    editorViewRef,
    dispatchVisualPreviewHandlers,
    getImageForTarget,
    showOverlays,
  ]);

  return (
    <div className="h-full w-full overflow-hidden min-h-0 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={cleanContent}
          height="100%"
          className="h-full w-full min-w-0"
          editable={!readOnly}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={handleCreateEditorWithPreviews}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            drawSelection: true,
            tabSize: 4,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
          }}
        />
      </div>
      <ScriptEditorToolbar
        isFocusMode={isFocusMode}
        lineWrap={lineWrap}
        toggleLineWrap={toggleLineWrap}
        showOverlays={showOverlays}
        setShowOverlays={setShowOverlays}
        saveStatus={saveStatus}
        saveConflict={saveConflict}
        onSaveRequest={onSaveRequest}
        cursorPosition={cursorPosition}
        selectionInfo={selectionInfo}
        totalLines={totalLines}
      />
      <VisualPreviewModal
        open={isPreviewModalOpen}
        onOpenChange={setIsPreviewModalOpen}
        projectId={projectId}
        selection={previewSelection}
      />
    </div>
  );
};
