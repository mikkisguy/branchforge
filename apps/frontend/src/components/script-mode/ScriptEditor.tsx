import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useState, useCallback } from "react";
import type { Extension } from "@codemirror/state";
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
      ].flat(),
    [lineWrapExtension]
  );

  const cleanContent = useMemo(() => stripBOM(content), [content]);

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
            tabSize: 4,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
            searchKeymap: true,
          }}
        />
      </div>
      <div className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/20 font-code">
        <div className="flex items-center gap-2">
          <FontSizeSwitcher />
          <LineWrapSwitcher onChange={handleLineWrapChange} />
          <PaletteSwitcher />
        </div>
        <p>asdd</p>
      </div>
    </div>
  );
}
