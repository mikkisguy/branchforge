import { AlignJustify, WrapText } from "lucide-react";
import { STATUS_BAR_CONTROL_CLASSNAME } from "@/components/workspace/status-bar-control";

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
      aria-pressed={lineWrap}
      className={`${STATUS_BAR_CONTROL_CLASSNAME} font-code`}
      title={lineWrap ? "Disable line wrapping" : "Enable line wrapping"}
    >
      {lineWrap ? (
        <WrapText className="size-3" />
      ) : (
        <AlignJustify className="size-3" />
      )}
      <span>Wrap: {lineWrap ? "On" : "Off"}</span>
    </button>
  );
}
