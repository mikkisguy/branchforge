import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useState, useCallback, useEffect } from "react";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { renPy } from "../../lib/codemirror/renpy";
import {
  renPyBaseTheme,
  renPySyntaxHighlighting,
} from "../../lib/codemirror/renpy-theme";
import { PaletteSwitcher } from "./PaletteSwitcher";
import { FontSizeSwitcher } from "./FontSizeSwitcher";
import { LineWrapSwitcher } from "./LineWrapSwitcher";

interface ScriptEditorProps {
  content: string;
  onChange?: (value: string) => void;
}

/**
 * Strip BOM (Byte Order Mark) from content if present
 * The BOM character (U+FEFF) sometimes appears at the start of files
 * from GitLab, especially those created on Windows systems.
 */
function stripBOM(content: string): string {
  // U+FEFF is the BOM character
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function ScriptEditor({ content, onChange }: ScriptEditorProps) {
  const [lineWrapExtension, setLineWrapExtension] = useState<
    Extension | readonly Extension[]
  >([]);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
  const [selectionInfo, setSelectionInfo] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState(1);

  const handleLineWrapChange = useCallback(
    (extension: Extension | readonly Extension[]) => {
      setLineWrapExtension(extension);
    },
    []
  );

  // Extension to track cursor position and selection
  const updateListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const state = update.state;
          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);

          setCursorPosition({ line: line.number, col: pos - line.from + 1 });

          // Update total lines when document changes
          if (update.docChanged) {
            setTotalLines(state.doc.lines);
          }

          // Track selection info
          const selection = state.selection.main;
          if (selection.from !== selection.to) {
            const selectedText = state.doc.sliceString(
              selection.from,
              selection.to
            );
            const charCount = selectedText.length;
            const lineCount = selectedText.split("\n").length;
            setSelectionInfo(
              `${charCount} char${charCount !== 1 ? "s" : ""}${lineCount > 1 ? ` in ${lineCount} lines` : ""} selected`
            );
          } else {
            setSelectionInfo(null);
          }
        }
      }),
    []
  );

  const extensions = useMemo(
    () =>
      [
        renPy,
        renPyBaseTheme,
        renPySyntaxHighlighting,
        lineWrapExtension,
        updateListener,
      ].flat(),
    [lineWrapExtension, updateListener]
  );

  const cleanContent = useMemo(() => stripBOM(content), [content]);

  // Initialize totalLines from content on mount/when content changes externally
  useEffect(() => {
    setTotalLines(cleanContent.split("\n").length);
  }, [cleanContent]);

  return (
    <div className="h-full w-full overflow-hidden min-h-0 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={cleanContent}
          height="100%"
          className="h-full w-full min-w-0"
          editable={true}
          extensions={extensions}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            drawSelection: true,
            tabSize: 4,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
            searchKeymap: true,
          }}
        />
      </div>
      <div className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/20 font-code text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <FontSizeSwitcher />
          <LineWrapSwitcher onChange={handleLineWrapChange} />
          <PaletteSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <span>Ren'Py</span>
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          <span>UTF-8</span>
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          <span>4 spaces</span>
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.col}
          </span>
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          <span>
            {totalLines} {totalLines === 1 ? "line" : "lines"}
          </span>
          {selectionInfo && (
            <>
              <span className="w-px h-3 bg-border" aria-hidden="true" />
              <span className="text-foreground">{selectionInfo}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
