/**
 * ProseEditorGoalPill Component
 *
 * Renders the daily writing goal pill overlay below the editor content.
 * Supports focus mode dimming via hover state.
 */

import { WritingGoalPill } from "../WritingGoalPill";

interface ProseEditorGoalPillProps {
  /** Current word count for today */
  todayWordCount: number;
  /** Daily writing goal */
  dailyGoal: number;
  /** Whether focus mode is active */
  isFocusMode: boolean;
  /** Whether the bottom bar area is hovered (for focus mode dimming) */
  isBottomBarHovered: boolean;
  /** Callback when hover/focus starts */
  onHoverStart: () => void;
  /** Callback when hover/focus ends */
  onHoverEnd: () => void;
  /** Callback when the goal pill is clicked */
  onClick: () => void;
}

/**
 * Goal pill overlay displayed at the bottom of the editor content area.
 * Shows daily word count progress and supports focus mode dimming.
 */
export function ProseEditorGoalPill({
  todayWordCount,
  dailyGoal,
  isFocusMode,
  isBottomBarHovered,
  onHoverStart,
  onHoverEnd,
  onClick,
}: ProseEditorGoalPillProps) {
  return (
    <div
      className="relative z-10 -mt-12 px-4 pt-10 pb-2 border-b border-border bg-gradient-to-b from-transparent via-card/30 to-card/80 transition-opacity duration-300 ease-out flex justify-end max-md:hidden"
      style={{
        opacity: isFocusMode ? (isBottomBarHovered ? 1 : 0.4) : 1,
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocusCapture={onHoverStart}
      onBlurCapture={onHoverEnd}
    >
      <WritingGoalPill
        current={todayWordCount}
        goal={dailyGoal}
        onClick={onClick}
      />
    </div>
  );
}
