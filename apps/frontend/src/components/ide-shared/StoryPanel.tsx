// Storybook-style panel
interface StoryPanelProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function StoryPanel({
  children,
  title,
  className = "",
}: StoryPanelProps) {
  return (
    <div className={className}>
      {title && (
        <div
          className="absolute -top-3 left-6 px-4 py-1 text-sm font-display tracking-wide rounded z-10"
          style={{ background: "var(--theme-color)", color: "white" }}
        >
          {title}
        </div>
      )}

      <div className="bg-card/80 backdrop-blur border border-border/30 rounded-lg p-1 h-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
