import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { renPy } from "../../lib/codemirror/renpy";
import { renPyBaseTheme, renPySyntaxHighlighting } from "../../lib/codemirror/renpy-theme";

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
  const extensions = useMemo(
    () => [
      renPy,
      renPyBaseTheme,
      renPySyntaxHighlighting,
    ],
    []
  );

  return (
    <div className="h-full w-full overflow-hidden min-h-0 min-w-0 flex">
      <CodeMirror
        value={stripBOM(content)}
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
  );
}
