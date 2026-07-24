import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useCallback, useImperativeHandle, useEffect } from "react";
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
  /** Controlled label titles visibility. When provided, overrides internal state. */
  showLabelTitles?: boolean;
  onShowLabelTitlesChange?: (show: boolean) => void;
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
  showLabelTitles: propsShowLabelTitles,
  onShowLabelTitlesChange,
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

  const [internalShowLabelTitles, setInternalShowLabelTitles] =
    useLocalStorageBoolean("script:show-label-titles", true);
  const showLabelTitles = propsShowLabelTitles ?? internalShowLabelTitles;
  const setShowLabelTitles =
    onShowLabelTitlesChange ?? setInternalShowLabelTitles;

  // Create the highlight extension (only once)
  const { highlightStateField, setHighlightEffect } = useMemo(
    () => createHighlightExtension(),
    []
  );

  // Editor controller (scroll, highlight, font-size listener)
  const { editorViewRef, handleCreateEditor } = useScriptEditorController({
    scrollToLine,
    labelTitles,
    showLabelTitles,
    setHighlightEffect,
  });

  // Expose focus method to parent via ref
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
        // Explicitly add search extension with default configuration
        search({}),
        // Highlight matches of the current selection
        highlightSelectionMatches(),
      ].flat(),
    [lineWrapExtension, updateListener, highlightStateField]
  );

  // Dispatch label title updates when the map changes or visibility toggles
  useEffect(() => {
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        effects: [
          setLabelTitlesEffect.of(
            showLabelTitles && labelTitles ? labelTitles : new Map()
          ),
        ],
      });
    }
  }, [editorViewRef, labelTitles, showLabelTitles]);

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
          onCreateEditor={handleCreateEditor}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            drawSelection: true,
            tabSize: 4,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
            // searchKeymap is removed since we add search extension explicitly
          }}
        />
      </div>
      <ScriptEditorToolbar
        isFocusMode={isFocusMode}
        lineWrap={lineWrap}
        toggleLineWrap={toggleLineWrap}
        showLabelTitles={showLabelTitles}
        setShowLabelTitles={setShowLabelTitles}
        saveStatus={saveStatus}
        saveConflict={saveConflict}
        onSaveRequest={onSaveRequest}
        cursorPosition={cursorPosition}
        selectionInfo={selectionInfo}
        totalLines={totalLines}
      />
    </div>
  );
};
