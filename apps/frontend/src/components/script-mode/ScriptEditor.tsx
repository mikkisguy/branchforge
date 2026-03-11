// Code editor with storybook styling
interface EditorProps {
  content: string[];
  language: string;
}

export function ScriptEditor({ content = [] }: EditorProps) {
  return (
    <div className="font-mono text-sm h-full overflow-auto">
      <div className="flex">
        <div
          className="text-muted-foreground/30 pr-3 py-2 select-none text-right"
          style={{ minWidth: "2rem" }}
        >
          {content.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div
          className="flex-1 py-2 pl-2 border-l border-dashed"
          style={{ borderColor: "var(--theme-border-subtle)" }}
        >
          {content.map((line, i) => (
            <div key={i} className="py-0.5">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
