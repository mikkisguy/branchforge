import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";
import { renpy } from "@/lib/codemirror-renpy";
import {
  branchforgeTheme,
  branchforgeSyntaxHighlighting,
} from "@/lib/codemirror-theme";

interface ScriptEditorProps {
  content: string;
  onChange?: (value: string) => void;
}

export function ScriptEditor({ content, onChange }: ScriptEditorProps) {
  const extensions = useMemo(
    () => [
      renpy(),
      branchforgeTheme,
      branchforgeSyntaxHighlighting,
      EditorView.theme({
        ".cm-editor": {
          height: "100%",
          width: "100%",
          maxWidth: "100%",
        },
        ".cm-scroller": {
          overflowX: "auto",
          overflowY: "auto",
        },
      }),
    ],
    []
  );

  return (
    <div className="h-full w-full overflow-hidden min-h-0 min-w-0 flex">
      <CodeMirror
        value={content}
        height="100%"
        className="h-full w-full min-w-0"
        editable={true}
        theme="none"
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
