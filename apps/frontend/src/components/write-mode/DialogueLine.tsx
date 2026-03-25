/**
 * DialogueLine Component
 *
 * Individual dialogue/narration line component with speaker dropdown on hover.
 */

import { useState, useCallback, useRef, useEffect, useId } from "react";
import { X, ChevronDown } from "lucide-react";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character } from "@branchforge/shared";
import { withAlpha } from "@/lib/utils";

interface DialogueLineProps {
  entry: DialogueEntry;
  characters: Character[];
  layoutMode: "inline" | "stacked";
  index: number;
  totalEntries: number;
  onChange: (entry: DialogueEntry) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddLine?: (index: number) => void;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
}

export function DialogueLine({
  entry,
  characters,
  layoutMode,
  index,
  totalEntries,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddLine,
  textareaRef,
}: DialogueLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number>(-1);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const speakerButtonRef = useRef<HTMLButtonElement>(null);
  const wasDropdownOpenRef = useRef(false);
  const dropdownId = useId();

  const resizeTextarea = useCallback(() => {
    const textarea = internalTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    resizeTextarea();
  }, [entry.text, resizeTextarea]);

  // Recalculate heights on viewport changes to avoid stale wrapped-line heights
  useEffect(() => {
    window.addEventListener("resize", resizeTextarea);
    return () => window.removeEventListener("resize", resizeTextarea);
  }, [resizeTextarea]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Shared helper: computes available space above/below the dropdown trigger
  const computeDropdownSpaces = useCallback(() => {
    const trigger = dropdownRef.current;
    if (!trigger) return null;

    const editorScrollArea = trigger.closest(
      '[data-prose-editor-scroll="true"]'
    ) as HTMLElement | null;

    const bounds = editorScrollArea
      ? editorScrollArea.getBoundingClientRect()
      : ({ top: 0, bottom: window.innerHeight } as const);

    const triggerRect = trigger.getBoundingClientRect();
    const spaceBelow = bounds.bottom - triggerRect.bottom;
    const spaceAbove = triggerRect.top - bounds.top;

    return { spaceAbove, spaceBelow, triggerRect };
  }, []);

  const updateDropdownDirection = useCallback(() => {
    const menu = dropdownMenuRef.current;
    if (!menu) return;

    const spaces = computeDropdownSpaces();
    if (!spaces) return;

    const menuHeight = Math.min(menu.scrollHeight, 240) + 8;
    setOpenUpward(
      spaces.spaceBelow < menuHeight && spaces.spaceAbove > spaces.spaceBelow
    );
  }, [computeDropdownSpaces]);

  const getShouldOpenUpward = useCallback(
    (menuHeight: number) => {
      const spaces = computeDropdownSpaces();
      if (!spaces) return false;

      return (
        spaces.spaceBelow < menuHeight && spaces.spaceAbove > spaces.spaceBelow
      );
    },
    [computeDropdownSpaces]
  );

  const estimateDropdownHeight = useCallback(() => {
    const rowHeight = 36;
    const dividerHeight = 8;
    const estimated = rowHeight * (characters.length + 1) + dividerHeight;
    return Math.min(estimated, 240) + 8;
  }, [characters.length]);

  const handleSpeakerToggle = useCallback(() => {
    setIsDropdownOpen((prev) => {
      if (prev) {
        setFocusedOptionIndex(-1);
        return false;
      }

      // Precompute direction before first paint to avoid open-then-flip flicker.
      const estimatedHeight = estimateDropdownHeight();
      setOpenUpward(getShouldOpenUpward(estimatedHeight));
      // Set initial focus to the current speaker or Narration
      const initialIndex = entry.speaker
        ? characters.findIndex((c) => c.displayName === entry.speaker) + 1
        : 0;
      setFocusedOptionIndex(initialIndex);
      return true;
    });
  }, [estimateDropdownHeight, getShouldOpenUpward, entry.speaker, characters]);

  // Open dropdown upward when there is not enough room below in the editor area
  useEffect(() => {
    if (!isDropdownOpen) return;

    const editorScrollArea = dropdownRef.current?.closest(
      '[data-prose-editor-scroll="true"]'
    ) as HTMLElement | null;

    const rafId = window.requestAnimationFrame(updateDropdownDirection);

    window.addEventListener("resize", updateDropdownDirection);
    editorScrollArea?.addEventListener("scroll", updateDropdownDirection, {
      passive: true,
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateDropdownDirection);
      editorScrollArea?.removeEventListener("scroll", updateDropdownDirection);
    };
  }, [isDropdownOpen, updateDropdownDirection]);

  // Scroll focused option into view
  useEffect(() => {
    if (isDropdownOpen && focusedOptionIndex >= 0) {
      const option = document.getElementById(
        `${dropdownId}-option-${focusedOptionIndex}`
      );
      if (
        option &&
        dropdownMenuRef.current &&
        typeof option.scrollIntoView === "function"
      ) {
        option.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }
  }, [focusedOptionIndex, isDropdownOpen, dropdownId]);

  useEffect(() => {
    if (isDropdownOpen) {
      dropdownMenuRef.current?.focus();
    } else if (wasDropdownOpenRef.current) {
      speakerButtonRef.current?.focus();
    }

    wasDropdownOpenRef.current = isDropdownOpen;
  }, [isDropdownOpen]);

  // Handle speaker selection from dropdown
  const handleSpeakerSelect = useCallback(
    (speaker: string | null) => {
      onChange({ ...entry, speaker });
      setIsDropdownOpen(false);
      setFocusedOptionIndex(-1);
    },
    [entry, onChange]
  );

  // Handle text change
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange({ ...entry, text: e.target.value });
    },
    [entry, onChange]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to add new line (handled by parent)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onAddLine?.(index);
      }

      // Backspace on empty line to delete
      if (e.key === "Backspace" && entry.text === "" && totalEntries > 1) {
        e.preventDefault();
        onDelete();
      }

      // Arrow up/down with ctrl/cmd to move lines
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp" && index > 0) {
        e.preventDefault();
        onMoveUp();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "ArrowDown" &&
        index < totalEntries - 1
      ) {
        e.preventDefault();
        onMoveDown();
      }
    },
    [entry, index, totalEntries, onDelete, onMoveUp, onMoveDown, onAddLine]
  );

  // Handle dropdown keyboard navigation
  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const totalOptions = characters.length + 1; // +1 for Narration

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
          break;

        case "ArrowDown":
          e.preventDefault();
          setFocusedOptionIndex((prev) =>
            prev < totalOptions - 1 ? prev + 1 : 0
          );
          break;

        case "ArrowUp":
          e.preventDefault();
          setFocusedOptionIndex((prev) =>
            prev > 0 ? prev - 1 : totalOptions - 1
          );
          break;

        case "Home":
          e.preventDefault();
          setFocusedOptionIndex(0);
          break;

        case "End":
          e.preventDefault();
          setFocusedOptionIndex(totalOptions - 1);
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedOptionIndex === 0) {
            handleSpeakerSelect(null);
          } else if (focusedOptionIndex > 0) {
            const char = characters[focusedOptionIndex - 1];
            if (char) {
              handleSpeakerSelect(char.displayName);
            }
          }
          break;
      }
    },
    [characters, focusedOptionIndex, handleSpeakerSelect]
  );

  const handleDropdownBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setIsDropdownOpen(false);
        setFocusedOptionIndex(-1);
      }
    },
    []
  );

  // Get character color for speaker
  const character = entry.speaker
    ? characters.find((c) => c.displayName === entry.speaker)
    : null;
  const speakerColor = character?.color || "var(--theme-color)";
  const isStacked = layoutMode === "stacked";
  const isSpeakerInteractive = isHovered || isDropdownOpen;
  const hasSpeaker = Boolean(entry.speaker);

  // Start with the non-speaker baseline, then override it for speaker states.
  let speakerButtonBackgroundColor = "transparent";
  let speakerButtonColor = "var(--foreground/50)";
  let speakerButtonBorderColor = "transparent";
  let speakerButtonOpacity = 0.62;
  let speakerButtonFontStyle: "normal" | "italic" = "italic";

  if (hasSpeaker) {
    // Speaker lines use the character color and lose the italic narration style.
    speakerButtonColor = speakerColor;
    speakerButtonFontStyle = "normal";
    speakerButtonOpacity = isSpeakerInteractive ? 0.88 : 0.82;

    if (isSpeakerInteractive) {
      // Hovering or opening the dropdown adds a subtle colored chip and border.
      speakerButtonBackgroundColor = withAlpha(speakerColor, 15);
      speakerButtonBorderColor = withAlpha(speakerColor, 30);
    }
  } else if (isSpeakerInteractive) {
    // Narration stays muted, but interactive hover still reveals the border.
    speakerButtonBorderColor = "hsl(var(--border))";
    speakerButtonOpacity = 0.72;
  }

  return (
    <div
      className={`group relative ${
        isStacked
          ? "flex flex-col gap-1.5 py-2"
          : "flex items-start gap-3 py-1.5"
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Speaker Name / Dropdown */}
      <div
        className={`relative ${isStacked ? "w-full" : "shrink-0 w-32"}`}
        ref={dropdownRef}
        onBlur={handleDropdownBlur}
      >
        {/* Stable speaker control prevents vertical jumps between hover states */}
        <button
          ref={speakerButtonRef}
          type="button"
          onClick={handleSpeakerToggle}
          aria-haspopup="listbox"
          aria-expanded={isDropdownOpen}
          aria-controls={dropdownId}
          aria-label={`Change speaker: ${entry.speaker || "Narration"}`}
          className={`flex gap-1 rounded-md text-sm font-normal transition-all border tracking-normal ${
            isStacked
              ? "inline-flex items-center h-8 py-1.5 px-3 -ml-3"
              : "items-start h-auto py-0 px-3 leading-8"
          }`}
          style={{
            backgroundColor: speakerButtonBackgroundColor,
            color: speakerButtonColor,
            borderColor: speakerButtonBorderColor,
            opacity: speakerButtonOpacity,
            fontStyle: speakerButtonFontStyle,
          }}
          title={
            entry.speaker
              ? character?.dialogueStyle || "Character dialogue"
              : "Narration"
          }
        >
          <span>{entry.speaker || "Narration"}</span>
          <ChevronDown
            className={`w-3 h-3 transition-opacity ${
              isStacked ? "" : "self-center"
            }`}
            style={{ opacity: isSpeakerInteractive ? 0.5 : 0 }}
          />
        </button>

        {/* Dropdown Menu (opens on click) */}
        {isDropdownOpen && (
          <div
            ref={dropdownMenuRef}
            id={dropdownId}
            role="listbox"
            aria-label="Select speaker"
            aria-activedescendant={
              focusedOptionIndex >= 0
                ? `${dropdownId}-option-${focusedOptionIndex}`
                : undefined
            }
            onKeyDown={handleDropdownKeyDown}
            tabIndex={0}
            className={`absolute z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] max-h-[240px] overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-150 ${
              openUpward ? "bottom-full mb-1" : "top-full mt-1"
            } ${
              openUpward ? "slide-in-from-bottom-1" : "slide-in-from-top-1"
            } ${isStacked ? "-left-3" : "left-0"}`}
          >
            {/* Narration option */}
            <button
              id={`${dropdownId}-option-0`}
              type="button"
              role="option"
              aria-selected={!entry.speaker}
              onClick={() => handleSpeakerSelect(null)}
              tabIndex={-1}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                focusedOptionIndex === 0 ? "bg-muted/70" : ""
              }`}
              style={{
                fontStyle: "italic",
                fontWeight: !entry.speaker ? "600" : "normal",
              }}
            >
              Narration
            </button>

            <div className="my-1 border-t border-border/50" role="separator" />

            {/* Character options */}
            {characters.map((char, idx) => (
              <button
                key={char.id}
                id={`${dropdownId}-option-${idx + 1}`}
                type="button"
                role="option"
                aria-selected={entry.speaker === char.displayName}
                onClick={() => handleSpeakerSelect(char.displayName)}
                tabIndex={-1}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 ${
                  focusedOptionIndex === idx + 1 ? "bg-muted/70" : ""
                }`}
                style={{
                  color: char.color,
                  fontWeight:
                    entry.speaker === char.displayName ? "600" : "normal",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: char.color }}
                />
                <span>{char.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text Content */}
      <textarea
        ref={(el) => {
          internalTextareaRef.current = el;
          if (textareaRef) textareaRef(el);
        }}
        value={entry.text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={entry.speaker ? "Dialogue..." : "Narration..."}
        className={`min-h-[52px] p-0 resize-none overflow-hidden bg-transparent border-0 outline-none font-light tracking-normal text-foreground placeholder:text-muted-foreground/28 leading-8 ${
          isStacked ? "w-full pr-7" : "flex-1"
        }`}
        style={{
          fontSize: `var(--prose-editor-font-size, 16px)`,
          fontStyle: !entry.speaker ? "italic" : "normal",
        }}
      />

      {/* Delete Button */}
      {(isHovered || entry.text === "") && totalEntries > 1 && (
        <button
          onClick={onDelete}
          className={`p-1 text-muted-foreground/30 hover:text-destructive transition-colors ${
            isStacked ? "absolute right-0 top-2" : "shrink-0"
          }`}
          title="Delete line (Backspace)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
