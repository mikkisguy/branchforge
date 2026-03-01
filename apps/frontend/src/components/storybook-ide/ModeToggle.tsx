// Mode toggle buttons
interface ModeToggleProps {
  mode: "story" | "editor";
  setMode: (mode: "story" | "editor") => void;
}

export function ModeToggle({ mode, setMode }: ModeToggleProps) {
  return (
    <div className="bg-card/90 backdrop-blur border border-border/30 rounded-full p-1 flex gap-1">
      <button
        onClick={() => setMode("story")}
        className={`px-6 py-2 rounded-full text-sm font-display tracking-wide transition-all ${
          mode === "story"
            ? "text-white"
            : "text-muted-foreground hover:text-foreground"
        }`}
        style={mode === "story" ? { background: "var(--theme-color)" } : {}}
      >
        📖 Story Mode
      </button>
      <button
        onClick={() => setMode("editor")}
        className={`px-6 py-2 rounded-full text-sm font-display tracking-wide transition-all ${
          mode === "editor"
            ? "text-white"
            : "text-muted-foreground hover:text-foreground"
        }`}
        style={mode === "editor" ? { background: "var(--theme-color)" } : {}}
      >
        ✏️ Editor Mode
      </button>
    </div>
  );
}
