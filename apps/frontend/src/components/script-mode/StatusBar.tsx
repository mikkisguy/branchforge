// Status bar styled like a storybook footer
interface StatusBarProps {
  lineCount: number;
  language: string;
  themeName: string;
}

export function StatusBar({
  lineCount,
  language,
  themeName,
}: StatusBarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-xs bg-card/90 backdrop-blur border-t border-dashed"
      style={{ borderColor: "var(--theme-border-subtle)" }}
    >
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground"> {language}</span>
        <span className="text-muted-foreground"> {themeName}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">Line {lineCount}</span>
        <span
          className="flex items-center gap-1.5"
          style={{ color: "var(--theme-color)" }}
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--theme-color)" }}
          />
          <span>Ready to write</span>
        </span>
      </div>
    </div>
  );
}
