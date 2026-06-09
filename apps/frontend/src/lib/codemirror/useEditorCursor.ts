import { useMemo, useState, useEffect } from "react";
import { EditorView } from "@codemirror/view";
import { updateSearchPanel } from "./search-panel";

export interface CursorPosition {
  line: number;
  col: number;
}

interface UseEditorCursorOptions {
  /** Initial content to calculate total lines from */
  initialContent?: string;
}

/**
 * Hook for tracking cursor position, selection info, and total lines in a CodeMirror editor.
 * Returns the state values and an extension to add to the editor.
 */
export function useEditorCursor(options?: UseEditorCursorOptions) {
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 1,
    col: 1,
  });
  const [selectionInfo, setSelectionInfo] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState(1);

  // Initialize totalLines from initial content on mount
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (options?.initialContent !== undefined) {
      setTotalLines(options.initialContent.split("\n").length);
    }
    // Only run on mount
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

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
              `${charCount} char${charCount !== 1 ? "s" : ""}${
                lineCount > 1 ? ` in ${lineCount} lines` : ""
              } selected`
            );
          } else {
            setSelectionInfo(null);
          }
        }

        updateSearchPanel(update.view);
      }),
    []
  );

  return {
    cursorPosition,
    selectionInfo,
    totalLines,
    setTotalLines,
    updateListener,
  };
}
