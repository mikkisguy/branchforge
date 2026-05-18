// Tab styled like a bookmark
interface BookmarkTabProps {
  name: string;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
}

export function BookmarkTab({
  name,
  isActive,
  onClick,
  onClose,
}: BookmarkTabProps) {
  return (
    <div
      role="tab"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative cursor-pointer px-4 py-2 pr-8 font-display text-sm tracking-wide transition-all ${
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      style={{
        background: isActive ? "var(--theme-color)" : "transparent",
        color: isActive ? "white" : undefined,
      }}
    >
      <span className="relative z-10">{name}</span>
      {/* Bookmark tail effect */}
      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2"
          style={{
            background: "var(--theme-color)",
            clipPath: "polygon(0 100%, 5% 0, 95% 0, 100% 100%)",
          }}
        />
      )}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-4 rounded flex items-center justify-center hover:bg-white/20"
          aria-label={`Close ${name}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
