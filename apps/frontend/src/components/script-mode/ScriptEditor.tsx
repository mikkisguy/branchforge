import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useState, useCallback } from "react";
import type { Extension } from "@codemirror/state";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { renPy } from "../../lib/codemirror/renpy";
import {
  renPyBaseTheme,
  renPySyntaxHighlighting,
} from "../../lib/codemirror/renpy-theme";
import { stripBOM } from "../../lib/codemirror/utils";
import { useEditorCursor } from "../../lib/codemirror/useEditorCursor";
import { PaletteSwitcher } from "./PaletteSwitcher";
import { FontSizeSwitcher } from "../FontSizeSwitcher";
import { LineWrapSwitcher } from "./LineWrapSwitcher";

interface ScriptEditorProps {
  content: string;
  onChange?: (value: string) => void;
}

export function ScriptEditor({ content, onChange }: ScriptEditorProps) {
  const [lineWrapExtension, setLineWrapExtension] = useState<
    Extension | readonly Extension[]
  >([]);
  const cleanContent = useMemo(() => stripBOM(content), [content]);

  const {
    cursorPosition,
    selectionInfo,
    totalLines,
    updateListener,
  } = useEditorCursor({ initialContent: cleanContent });

  const handleLineWrapChange = useCallback(
    (extension: Extension | readonly Extension[]) => {
      setLineWrapExtension(extension);
    },
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
        // Explicitly add search extension with default configuration
        search({}),
        // Highlight matches of the current selection
        highlightSelectionMatches(),
      ].flat(),
    [lineWrapExtension, updateListener]
  );

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
            // searchKeymap is removed since we add search extension explicitly
          }}
        />
      </div>
      <div className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/20 font-code text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <FontSizeSwitcher mode="script" direction="up" />
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
