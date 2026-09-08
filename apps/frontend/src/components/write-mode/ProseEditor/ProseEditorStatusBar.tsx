/**
 * ProseEditorStatusBar Component
 *
 * Bottom status bar for the prose editor with layout and badges toggles,
 * font switchers, and word/line counts.
 */

import { PanelTop, Eye, EyeOff } from "lucide-react";
import { FontSizeSwitcher } from "../../FontSizeSwitcher";
import { FontFamilySwitcher } from "../FontFamilySwitcher";
import { STATUS_BAR_CONTROL_CLASSNAME } from "@/components/workspace/status-bar-control";
import type { LineLayoutMode } from "./ProseEditor";
import { cn } from "@/lib/utils";

interface ProseEditorStatusBarProps {
  /** Current line layout mode */
  layoutMode: LineLayoutMode;
  /** Callback to change layout mode */
  onLayoutModeChange: (mode: LineLayoutMode) => void;
  /** Whether technical badges are shown */
  showBadges: boolean;
  /** Callback to toggle badges */
  onShowBadgesToggle: () => void;
  /** Current word count */
  wordCount: number;
  /** Current line count */
  lineCount: number;
  /** Controlled font size value */
  fontSizeValue?: number;
  /** Controlled font size change handler */
  onFontSizeChange?: (value: number) => void;
  /** Controlled font family value */
  fontFamilyValue?: string;
  /** Controlled font family change handler */
  onFontFamilyChange?: (value: string) => void;
  /** Whether focus mode is active */
  isFocusMode: boolean;
  /** Whether the bottom bar area is hovered (for focus mode dimming) */
  isBottomBarHovered: boolean;
  /** Callback when mouse enters the bottom bar area */
  onBottomBarHoverStart: () => void;
  /** Callback when mouse leaves the bottom bar area */
  onBottomBarHoverEnd: () => void;
}

/**
 * Bottom status bar for the prose editor.
 *
 * Provides layout mode toggle, badges visibility toggle,
 * font family and size switchers, and word/line count display.
 * Supports focus mode dimming via hover state.
 */
export function ProseEditorStatusBar({
  layoutMode,
  onLayoutModeChange,
  showBadges,
  onShowBadgesToggle,
  wordCount,
  lineCount,
  fontSizeValue,
  onFontSizeChange,
  fontFamilyValue,
  onFontFamilyChange,
  isFocusMode,
  isBottomBarHovered,
  onBottomBarHoverStart,
  onBottomBarHoverEnd,
}: ProseEditorStatusBarProps) {
  return (
    <div
      className="w-full px-4 py-2 border-t border-border bg-card rounded-b-lg transition-opacity duration-300 ease-out max-md:hidden"
      style={{
        opacity: isFocusMode ? (isBottomBarHovered ? 1 : 0.4) : 1,
      }}
      onMouseEnter={onBottomBarHoverStart}
      onMouseLeave={onBottomBarHoverEnd}
      onFocusCapture={onBottomBarHoverStart}
      onBlurCapture={onBottomBarHoverEnd}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onLayoutModeChange(layoutMode === "inline" ? "stacked" : "inline")
            }
            className={STATUS_BAR_CONTROL_CLASSNAME}
            title="Toggle line layout"
          >
            <PanelTop className="size-3" aria-hidden="true" />
            <span>{layoutMode === "inline" ? "Inline" : "Stacked"}</span>
          </button>
          <button
            type="button"
            onClick={onShowBadgesToggle}
            className={cn(
              STATUS_BAR_CONTROL_CLASSNAME,
              showBadges && "bg-muted/40 text-foreground"
            )}
            title="Toggle technical badges (jumps, menus, etc.)"
            aria-pressed={showBadges}
          >
            {showBadges ? (
              <Eye className="size-3" aria-hidden="true" />
            ) : (
              <EyeOff className="size-3" aria-hidden="true" />
            )}
            <span>Badges: {showBadges ? "On" : "Off"}</span>
          </button>
          <FontFamilySwitcher
            direction="up"
            value={fontFamilyValue}
            onChange={onFontFamilyChange}
          />
          <FontSizeSwitcher
            mode="write"
            direction="up"
            value={fontSizeValue}
            onChange={onFontSizeChange}
          />
        </div>

        <div className="flex items-center gap-4 text-sm max-md:hidden">
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{wordCount}</span>{" "}
            word{wordCount !== 1 ? "s" : ""}
          </span>
          <span className="w-px h-4 bg-border" />
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{lineCount}</span>{" "}
            line{lineCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
