// Storybook-style panel with decorative corners
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
    <div className={`relative ${className}`}>
      {/* Decorative corner flourishes */}
      <div
        className="absolute -top-1 -left-1 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg"
        style={{ borderColor: "var(--theme-color)", opacity: 0.5 }}
      />
      <div
        className="absolute -top-1 -right-1 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg"
        style={{ borderColor: "var(--theme-color)", opacity: 0.5 }}
      />
      <div
        className="absolute -bottom-1 -left-1 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg"
        style={{ borderColor: "var(--theme-color)", opacity: 0.5 }}
      />
      <div
        className="absolute -bottom-1 -right-1 w-8 h-8 border-b-2 border-r-2 rounded-br-lg"
        style={{ borderColor: "var(--theme-color)", opacity: 0.5 }}
      />

      {title && (
        <div
          className="absolute -top-3 left-6 px-4 py-1 text-sm font-display tracking-wide rounded z-10"
          style={{ background: "var(--theme-color)", color: "white" }}
        >
          {title}
        </div>
      )}

      <div className="bg-card/80 backdrop-blur border border-border/30 rounded-lg p-4 h-full">
        {children}
      </div>
    </div>
  );
}
