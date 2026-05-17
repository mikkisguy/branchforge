import { AlignJustify, WrapText } from "lucide-react";

/**
 * Line wrap toggle for the code editor.
 *
 * Presentational component — line wrap state is owned by the parent
 * and passed in via props to avoid effect-driven state sync.
 */
interface LineWrapSwitcherProps {
  lineWrap: boolean;
  onToggle: () => void;
}

export function LineWrapSwitcher({
  lineWrap,
  onToggle,
}: LineWrapSwitcherProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-1.5 text-xs font-code border rounded flex items-center gap-2 transition-colors ${
        lineWrap
          ? "bg-accent/50 hover:bg-accent border-border"
          : "bg-muted/50 hover:bg-muted border-border"
      }`}
      title={lineWrap ? "Disable line wrapping" : "Enable line wrapping"}
    >
      {lineWrap ? (
        <WrapText className="w-3 h-3" />
      ) : (
        <AlignJustify className="w-3 h-3" />
      )}
      <span>Wrap: {lineWrap ? "On" : "Off"}</span>
    </button>
  );
}
