// File tree styled like a book's table of contents
export interface File {
  name: string;
  type: "file" | "folder";
  icon?: string;
}

interface FileTreeProps {
  files: File[];
  activeFile: string;
  onSelectFile: (name: string) => void;
}

export function FileTree({
  files,
  activeFile,
  onSelectFile,
}: FileTreeProps) {
  return (
    <div className="space-y-1">
      <div
        className="text-s font-display tracking-wider text-muted-foreground mb-3 pb-2 border-b border-dashed"
        style={{ borderColor: "var(--theme-color)" }}
      >
        Contents
      </div>
      {files.map((file, i) => (
        <button
          key={i}
          onClick={() => file.type === "file" && onSelectFile(file.name)}
          disabled={file.type === "folder"}
          className={`w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-all ${
            file.type === "folder"
              ? "text-foreground/70 cursor-default italic"
              : activeFile === file.name
                ? "bg-muted/50 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
          }`}
        >
          <span>{file.icon || (file.type === "folder" ? "" : "↳")}</span>
          <span className="font-medium">{file.name}</span>
        </button>
      ))}
    </div>
  );
}
