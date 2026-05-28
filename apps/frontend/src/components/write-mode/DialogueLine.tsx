/**
 * DialogueLine Component
 *
 * Individual dialogue/narration line component with speaker dropdown.
 * Matches app design system with theme colors and simple styling.
 */

import { memo, useState, useCallback, useRef, useEffect, useId } from "react";
import { X, ChevronDown } from "lucide-react";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character } from "@branchforge/shared";
import { withAlpha } from "@/lib/utils";
import { TechnicalBadge } from "./TechnicalBadge";
import { TechnicalPopover } from "./TechnicalPopover";

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
  technicalInfo?: DialogueEntry["technicalInfo"];
  showBadges?: boolean;
}

function areDialogueLinePropsEqual(
  prev: DialogueLineProps,
  next: DialogueLineProps
): boolean {
  return (
    prev.entry.id === next.entry.id &&
    prev.entry.speakerId === next.entry.speakerId &&
    prev.entry.text === next.entry.text &&
    prev.index === next.index &&
    prev.totalEntries === next.totalEntries &&
    prev.layoutMode === next.layoutMode &&
    prev.characters === next.characters &&
    prev.onChange === next.onChange &&
    prev.onDelete === next.onDelete &&
    prev.onMoveUp === next.onMoveUp &&
    prev.onMoveDown === next.onMoveDown &&
    prev.onAddLine === next.onAddLine &&
    prev.textareaRef === next.textareaRef &&
    prev.technicalInfo === next.technicalInfo &&
    prev.showBadges === next.showBadges
  );
}

export const DialogueLine = memo(function DialogueLine({
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
  technicalInfo,
  showBadges,
}: DialogueLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number>(-1);
  const [popoverType, setPopoverType] = useState<
    "conditions" | "jump" | "visuals" | null
  >(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const speakerButtonRef = useRef<HTMLButtonElement>(null);
  const wasDropdownOpenRef = useRef(false);
  const dropdownId = useId();
  const textOnChangeRef = useRef(onChange);
  const previousTextRef = useRef(entry.text);
  const measureRef = useRef<HTMLSpanElement>(null);

  const resizeTextarea = useCallback(() => {
    const textarea = internalTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const targetHeight = textarea.scrollHeight;
    textarea.style.height = `${targetHeight}px`;
  }, []);

  // Keep track of the latest onChange function
  useEffect(() => {
    textOnChangeRef.current = onChange;
  }, [onChange]);

  // Initialize textarea value on mount
  useEffect(() => {
    const textarea = internalTextareaRef.current;
    if (textarea && textarea.value !== entry.text) {
      textarea.value = entry.text;
      previousTextRef.current = entry.text;
      resizeTextarea();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Sync external text changes (e.g., from undo/redo or label switch)
  useEffect(() => {
    const textarea = internalTextareaRef.current;
    if (!textarea) return;

    const isFocused = document.activeElement === textarea;

    // Only sync if this is an external change and textarea is not focused
    if (
      !isFocused &&
      entry.text !== previousTextRef.current &&
      entry.text !== textarea.value
    ) {
      textarea.value = entry.text;
      previousTextRef.current = entry.text;
      resizeTextarea();
    }
  }, [entry.id, entry.text, resizeTextarea]); // Also depend on entry.id to detect label switches

  useEffect(() => {
    window.addEventListener("resize", resizeTextarea);
    return () => window.removeEventListener("resize", resizeTextarea);
  }, [resizeTextarea]);

  // Re-measure when font settings change via CSS custom properties
  useEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    const observer = new ResizeObserver(() => {
      resizeTextarea();
    });
    observer.observe(measure);
    return () => observer.disconnect();
  }, [resizeTextarea]);

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

    const menuHeight = Math.min(menu.scrollHeight, 280) + 8;
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
    const rowHeight = 40;
    const dividerHeight = 8;
    const estimated = rowHeight * (characters.length + 1) + dividerHeight;
    return Math.min(estimated, 280) + 8;
  }, [characters.length]);

  const handleSpeakerToggle = useCallback(() => {
    setIsDropdownOpen((prev) => {
      if (prev) {
        setFocusedOptionIndex(-1);
        return false;
      }

      const estimatedHeight = estimateDropdownHeight();
      setOpenUpward(getShouldOpenUpward(estimatedHeight));
      const initialIndex = entry.speakerId
        ? characters.findIndex((c) => c.id === entry.speakerId) + 1
        : 0;
      setFocusedOptionIndex(initialIndex);
      return true;
    });
  }, [
    estimateDropdownHeight,
    getShouldOpenUpward,
    entry.speakerId,
    characters,
  ]);

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

  const handleSpeakerSelect = useCallback(
    (speakerId: string | null) => {
      onChange({ id: entry.id, speakerId, text: entry.text });
      setIsDropdownOpen(false);
      setFocusedOptionIndex(-1);
    },
    [entry.id, entry.text, onChange]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Update the ref so we know this change came from user input
      previousTextRef.current = e.target.value;
      // Call onChange with updated entry (using ref to avoid stale closure)
      textOnChangeRef.current({
        id: entry.id,
        speakerId: entry.speakerId,
        text: e.target.value,
      });
      // Resize immediately for smooth typing experience
      resizeTextarea();
    },
    [entry.id, entry.speakerId, resizeTextarea]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onAddLine?.(index);
      }

      // Check if textarea is empty using the ref instead of entry.text
      if (
        e.key === "Backspace" &&
        internalTextareaRef.current?.value === "" &&
        totalEntries > 1
      ) {
        e.preventDefault();
        onDelete();
      }

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
    [index, totalEntries, onDelete, onMoveUp, onMoveDown, onAddLine]
  );

  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const totalOptions = characters.length + 1;

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
        // Small delay to handle React 19's focus event timing during transitions
        // TODO: This is a React antipattern, consider refactoring to avoid this if possible
        setTimeout(() => {
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
        }, 0);
      }
    },
    []
  );

  const character = entry.speakerId
    ? characters.find((c) => c.id === entry.speakerId)
    : null;
  const speakerColor = character?.color;
  const isStacked = layoutMode === "stacked";
  const isSpeakerInteractive = isHovered || isDropdownOpen;
  const hasSpeaker = Boolean(entry.speakerId);
  const showDelete = (isHovered || entry.text === "") && totalEntries > 1;

  return (
    <div
      className={`group relative transition-colors ${
        isStacked ? "flex flex-col gap-1.5 py-2" : "flex flex-col gap-1 py-1.5"
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Speaker and Text Content Row */}
      <div
        className={`flex ${isStacked ? "flex-col gap-1.5" : "items-start gap-3"}`}
      >
        {/* Speaker Name / Dropdown */}
        <div
          className={`relative ${isStacked ? "w-full" : "shrink-0 w-40"}`}
          ref={dropdownRef}
          onBlur={handleDropdownBlur}
        >
          <button
            ref={speakerButtonRef}
            type="button"
            onClick={handleSpeakerToggle}
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            aria-controls={dropdownId}
            aria-label={`Change speaker: ${
              character?.displayName || "Narration"
            }`}
            className={`flex items-center gap-1.5 rounded-md transition-all border tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isStacked
                ? "inline-flex max-w-full h-8 py-1.5 px-2.5 -ml-2.5"
                : "inline-flex max-w-full items-start h-auto py-1.5 px-2.5 overflow-hidden"
            }`}
            style={{
              fontSize: "var(--prose-editor-font-size, 14px)",
              backgroundColor: isSpeakerInteractive
                ? hasSpeaker && speakerColor
                  ? withAlpha(speakerColor, 8)
                  : "hsl(var(--muted) / 0.5)"
                : "transparent",
              borderColor: isSpeakerInteractive
                ? hasSpeaker && speakerColor
                  ? withAlpha(speakerColor, 25)
                  : "hsl(var(--border))"
                : "transparent",
              color:
                hasSpeaker && speakerColor
                  ? speakerColor
                  : "hsl(var(--muted-foreground))",
              fontStyle: hasSpeaker ? "normal" : "italic",
            }}
            title={
              hasSpeaker
                ? character?.displayName || "Character dialogue"
                : "Narration"
            }
          >
            <span className="truncate">
              {character?.displayName || "Narration"}
            </span>
            <ChevronDown
              className={`size-3 transition-transform duration-200 flex-shrink-0 ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
              style={{ opacity: isSpeakerInteractive ? 0.5 : 0 }}
            />
          </button>

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
              className={`absolute z-50 bg-popover border border-border rounded-md shadow-lg shadow-black/10 py-1 min-w-[160px] max-h-[280px] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] animate-in fade-in-0 zoom-in-95 duration-200 ease-out ${
                openUpward ? "bottom-full mb-1" : "top-full mt-1"
              } ${
                openUpward ? "slide-in-from-bottom-1" : "slide-in-from-top-1"
              } ${isStacked ? "-left-2.5" : "left-0"}`}
            >
              <button
                id={`${dropdownId}-option-0`}
                type="button"
                role="option"
                aria-selected={!entry.speakerId}
                onClick={() => handleSpeakerSelect(null)}
                tabIndex={-1}
                className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150 ${
                  focusedOptionIndex === 0 ? "bg-muted" : "hover:bg-muted"
                }`}
                style={{
                  fontStyle: "italic",
                  fontWeight: !entry.speakerId ? "600" : "normal",
                }}
              >
                Narration
              </button>

              <div className="my-1 border-t border-border" role="separator" />

              {characters.map((char, idx) => (
                <button
                  key={char.id}
                  id={`${dropdownId}-option-${idx + 1}`}
                  type="button"
                  role="option"
                  aria-selected={entry.speakerId === char.id}
                  onClick={() => handleSpeakerSelect(char.id)}
                  tabIndex={-1}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150 flex items-center gap-2 ${
                    focusedOptionIndex === idx + 1
                      ? "bg-muted"
                      : "hover:bg-muted"
                  }`}
                  style={{
                    color: entry.speakerId === char.id ? char.color : undefined,
                    fontWeight: entry.speakerId === char.id ? "600" : "normal",
                  }}
                >
                  <span
                    className="size-2 rounded-full shrink-0"
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
          defaultValue={entry.text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={entry.speakerId ? "Dialogue..." : "Narration..."}
          className={`relative min-h-[2.5rem] p-0 pr-7 resize-none overflow-hidden bg-transparent border-0 outline-none focus-visible:outline-none focus-visible:ring-0 font-light tracking-normal leading-8 placeholder:text-muted-foreground/50 ${
            isStacked ? "w-full" : "flex-1"
          }`}
          style={{
            fontSize: "var(--prose-editor-font-size, 16px)",
            fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
            fontStyle: !entry.speakerId ? "italic" : "normal",
            color: "hsl(var(--foreground))",
          }}
        />

        {/* Delete Button */}
        {showDelete && (
          <button
            onClick={onDelete}
            className="z-10 absolute right-0 top-0.5 p-1 rounded text-muted-foreground/70 hover:text-destructive bg-background/90 hover:bg-destructive/10 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title="Delete line (Backspace)"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Technical Badges - pill container anchored to parent line */}
      {showBadges &&
        technicalInfo &&
        (technicalInfo.conditions ||
          technicalInfo.jumpTarget ||
          (technicalInfo.visuals && technicalInfo.visuals.length > 0)) && (
          <div
            className={`mt-1 mb-3 relative ${isStacked ? "" : "ml-[172px]"}`}
          >
            <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border-b border-border/40 bg-muted/15">
              {/* Conditions badge */}
              {technicalInfo.conditions && (
                <TechnicalBadge
                  type="conditions"
                  data={technicalInfo.conditions}
                  isLineHovered={isHovered}
                  onClick={() =>
                    setPopoverType((prev) =>
                      prev === "conditions" ? null : "conditions"
                    )
                  }
                />
              )}

              {/* Jump badge */}
              {technicalInfo.jumpTarget && (
                <TechnicalBadge
                  type="jump"
                  data={technicalInfo.jumpTarget}
                  isLineHovered={isHovered}
                  onClick={() =>
                    setPopoverType((prev) => (prev === "jump" ? null : "jump"))
                  }
                />
              )}

              {/* Visuals badge */}
              {technicalInfo.visuals && technicalInfo.visuals.length > 0 && (
                <TechnicalBadge
                  type="visuals"
                  data={technicalInfo.visuals}
                  isLineHovered={isHovered}
                  onClick={() =>
                    setPopoverType((prev) =>
                      prev === "visuals" ? null : "visuals"
                    )
                  }
                />
              )}
            </div>

            {/* Popover - renders once at container level, anchored under badge row */}
            {popoverType === "conditions" && technicalInfo.conditions && (
              <TechnicalPopover
                type="conditions"
                data={technicalInfo.conditions}
                onClose={() => setPopoverType(null)}
              />
            )}
            {popoverType === "jump" && technicalInfo.jumpTarget && (
              <TechnicalPopover
                type="jump"
                data={technicalInfo.jumpTarget}
                onClose={() => setPopoverType(null)}
              />
            )}
            {popoverType === "visuals" && technicalInfo.visuals && (
              <TechnicalPopover
                type="visuals"
                data={technicalInfo.visuals}
                onClose={() => setPopoverType(null)}
              />
            )}
          </div>
        )}

      {/* Hidden measuring span — detects font size/family changes via ResizeObserver */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="absolute invisible pointer-events-none whitespace-pre"
        style={{
          fontSize: "var(--prose-editor-font-size, 16px)",
          fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
        }}
      >
        M
      </span>
    </div>
  );
}, areDialogueLinePropsEqual);
