// File tree styled like a book's table of contents
export interface ScriptFile {
  name: string;
  type: "file" | "folder";
  icon?: string;
}

interface FileTreeProps {
  files: ScriptFile[];
  activeFile: string;
  onSelectFile: (name: string) => void;
}

export function FileTree({ files, activeFile, onSelectFile }: FileTreeProps) {
  return (
    <div className="space-y-2">
      <div
        className="text-sm font-display tracking-wider text-muted-foreground pb-2 border-b border-dashed"
        style={{ borderColor: "var(--theme-color)" }}
      >
        Contents
      </div>
      <div className="space-y-0.5">
        {files.map((file, i) => (
          <button
            key={i}
            onClick={() => file.type === "file" && onSelectFile(file.name)}
            disabled={file.type === "folder"}
            className={`w-full flex items-center gap-2 py-2 px-2 rounded-md text-sm transition-all ${
              file.type === "folder"
                ? "text-foreground/70 cursor-default italic"
                : activeFile === file.name
                  ? "bg-muted/50 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/25"
            }`}
          >
            <span className="text-muted-foreground">
              {file.icon || (file.type === "folder" ? "" : "→")}
            </span>
            <span className="truncate text-left">{file.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
