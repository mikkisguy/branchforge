/**
 * DialogueLine Component
 *
 * Individual dialogue/narration line component with speaker dropdown.
 * Matches app design system with theme colors and simple styling.
 */

import {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useId,
  useMemo,
} from "react";
import { X, ChevronDown, Split, ArrowUpRight } from "lucide-react";
import type { DialogueEntry } from "@/lib/prose-types";
import type { Character } from "@branchforge/shared";
import { withAlpha } from "@/lib/utils";
import { TechnicalBadge } from "./TechnicalBadge";
import { TechnicalPopover } from "./TechnicalPopover";
import { RenderedLine } from "./RenderedLine";
import { tokenize } from "@/lib/renpy-tags";

// ---------------------------------------------------------------------------
// Click → raw-text offset mapping
// ---------------------------------------------------------------------------

/**
 * Given pixel coordinates (e.g. from a mouse click on the rendered overlay),
 * find the equivalent character offset in the RAW textarea text.
 *
 * Uses `caretRangeFromPoint` / `caretPositionFromPoint` to locate the text
 * node under the cursor, then reads `data-raw-start` and `data-raw-len` from
 * the enclosing rendered span to map back to raw-text coordinates.
 *
 * Returns `null` if the position can't be determined (e.g. clicked on empty
 * space, or the API is unavailable). Caller should fall back to default focus.
 */
function getRawOffsetFromPoint(x: number, y: number): number | null {
  let container: Node | null = null;
  let offset = 0;

  // Firefox: caretPositionFromPoint (standard)
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      container = pos.offsetNode;
      offset = pos.offset;
    }
  }

  // Chrome / Safari / Edge: caretRangeFromPoint (de-facto standard)
  if (
    container === null &&
    typeof document.caretRangeFromPoint === "function"
  ) {
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
      container = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (container === null) return null;

  // When the click lands on padding or an element node (rather than a text
  // node), `startOffset` is a *child index*, not a character offset. There's
  // no reliable way to map that back to a raw-text caret position, so bail
  // out and let the caller fall back to default focus.
  if (container.nodeType !== Node.TEXT_NODE) return null;

  // Walk up to the nearest rendered span with position metadata.
  const element = container.parentElement;
  const span = element?.closest("[data-raw-start]");
  if (!span) return null;

  const rawStart = parseInt(span.getAttribute("data-raw-start") || "0", 10);
  const rawLen = parseInt(span.getAttribute("data-raw-len") || "0", 10);
  const renderedLen = span.textContent?.length ?? 0;

  if (renderedLen === 0 || rawLen === renderedLen) {
    // Normal tokens (text, interpolation, malformed): 1:1 mapping.
    return rawStart + offset;
  }

  // Newline tokens: raw is 2 chars ("\n"), rendered is 1 char.
  // Scale proportionally and clamp to [rawStart, rawStart + rawLen].
  const scaled = Math.round((offset / renderedLen) * rawLen);
  return rawStart + Math.min(scaled, rawLen);
}

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

/**
 * Structural equality check for memo comparison.
 * Handles nested objects (e.g. effects.stats) and arrays (e.g. conditionFlags)
 * correctly via JSON.stringify, unlike shallow reference comparison.
 */
function isEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function areDialogueLinePropsEqual(
  prev: DialogueLineProps,
  next: DialogueLineProps
): boolean {
  return (
    prev.entry.id === next.entry.id &&
    prev.entry.speakerId === next.entry.speakerId &&
    prev.entry.text === next.entry.text &&
    prev.entry.choiceData?.lineId === next.entry.choiceData?.lineId &&
    prev.entry.choiceData?.targetLabelId ===
      next.entry.choiceData?.targetLabelId &&
    prev.entry.choiceData?.optionIndex === next.entry.choiceData?.optionIndex &&
    isEqualJson(
      prev.entry.choiceData?.conditionFlags,
      next.entry.choiceData?.conditionFlags
    ) &&
    isEqualJson(
      prev.entry.choiceData?.effects,
      next.entry.choiceData?.effects
    ) &&
    prev.entry.contentType === next.entry.contentType &&
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
    "conditions" | "jump" | "visuals" | "menu" | null
  >(null);
  const [showRemoveHint, setShowRemoveHint] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const removeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const speakerButtonRef = useRef<HTMLButtonElement>(null);
  const wasDropdownOpenRef = useRef(false);

  const dropdownId = useId();
  const textOnChangeRef = useRef(onChange);
  const previousTextRef = useRef(entry.text);
  const measureRef = useRef<HTMLSpanElement>(null);
  const isChoice = entry.contentType === "CHOICE";

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
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const textarea = internalTextareaRef.current;
    if (textarea && textarea.value !== entry.text) {
      textarea.value = entry.text;
      previousTextRef.current = entry.text;
      resizeTextarea();
    }
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, []); // Only run on mount
  /* eslint-enable react-hooks/exhaustive-deps */

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

  // react-doctor-disable-next-line react-doctor/advanced-event-handler-refs
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

  // Clean up remove-hint timer on unmount
  // oxlint-disable-next-line react/exhaustive-deps -- Mount-only effect; ref is stable, we intentionally read .current at cleanup time to clear pending timer
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (removeHintTimerRef.current) clearTimeout(removeHintTimerRef.current);
    };
  }, []);

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

  // react-doctor-disable-next-line react-doctor/advanced-event-handler-refs
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
    // react-doctor-disable-next-line react-doctor/no-event-handler
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
      onChange({
        id: entry.id,
        speakerId,
        text: entry.text,
        contentType: entry.contentType,
        choiceData: entry.choiceData,
      });
      setIsDropdownOpen(false);
      setFocusedOptionIndex(-1);
    },
    [onChange, entry.id, entry.text, entry.contentType, entry.choiceData]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // CHOICE entries must not have empty text — parser requires it
      if (entry.contentType === "CHOICE" && e.target.value === "") {
        e.target.value = previousTextRef.current;
        if (removeHintTimerRef.current)
          clearTimeout(removeHintTimerRef.current);
        setShowRemoveHint(true);
        removeHintTimerRef.current = setTimeout(
          () => setShowRemoveHint(false),
          2500
        );
        return;
      }
      // Update the ref so we know this change came from user input
      previousTextRef.current = e.target.value;
      // Call onChange with updated entry (using ref to avoid stale closure)
      textOnChangeRef.current({
        id: entry.id,
        speakerId: entry.speakerId,
        text: e.target.value,
        contentType: entry.contentType,
        choiceData: entry.choiceData,
      });
      // Resize immediately for smooth typing experience
      resizeTextarea();
    },
    [
      entry.id,
      entry.speakerId,
      entry.contentType,
      entry.choiceData,
      resizeTextarea,
    ]
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
        totalEntries > 1 &&
        !isChoice
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
    [totalEntries, isChoice, index, onAddLine, onDelete, onMoveUp, onMoveDown]
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

  // -- Rendered-line click → caret position mapping -------------------------
  // The rendered overlay hides formatting tags ({b}, {/b}, etc.), so its text
  // layout differs from the textarea's raw text. When the user clicks the
  // overlay, we use caretRangeFromPoint to find WHERE in the rendered text they
  // clicked, then map that to the equivalent position in the RAW text using
  // the data-raw-start / data-raw-len attributes on each rendered span.

  const handleRenderedLineClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const textarea = internalTextareaRef.current;
      if (!textarea) return;

      // Find the rendered text node at the click point.
      const rawPos = getRawOffsetFromPoint(e.clientX, e.clientY);

      // Focus first so the textarea is ready, then position the caret.
      textarea.focus();

      if (rawPos !== null) {
        textarea.setSelectionRange(rawPos, rawPos);
      }
    },
    []
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
  const isNarrator = character?.isNarrator ?? false;
  const isStacked = layoutMode === "stacked";
  const isSpeakerInteractive = isHovered || isDropdownOpen;
  const hasSpeaker = Boolean(entry.speakerId);
  const speakerFontStyle =
    !hasSpeaker || isNarrator ? "italic" : ("normal" as const);
  const choiceTargetName = entry.choiceData?.targetLabelName;
  const showDelete =
    (isHovered || entry.text === "") && totalEntries > 1 && !isChoice;

  const wrapperClass = isChoice
    ? `group relative transition-colors pl-3 ${
        isStacked ? "flex flex-col gap-1.5 py-2" : "flex flex-col gap-1 py-1.5"
      }`
    : `group relative transition-colors ${
        isStacked ? "flex flex-col gap-1.5 py-2" : "flex flex-col gap-1 py-1.5"
      }`;

  // Tokenize the raw text once per change. The tokenizer is O(n) and the
  // overlay is only mounted when the textarea is blurred, but we still
  // memoize to avoid re-tokenizing on every keystroke when the parent
  // re-renders for unrelated reasons (e.g. speaker hover state).
  const renderedTokens = useMemo(() => tokenize(entry.text), [entry.text]);

  return (
    <div
      className={wrapperClass}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Speaker and Text Content Row */}
      <div
        className={`flex ${isStacked ? "flex-col gap-1.5" : "items-start gap-3"}`}
      >
        {isChoice ? (
          <div className={`relative ${isStacked ? "w-full" : "shrink-0 w-40"}`}>
            <div
              className={`flex items-center gap-1.5 rounded-md transition-all h-8 py-1.5 px-2.5 ${
                isStacked ? "-ml-2.5" : ""
              }`}
              style={{
                fontSize: "var(--prose-editor-font-size, 14px)",
                color: "hsl(var(--muted-foreground))",
                fontStyle: "italic",
              }}
            >
              <Split className="size-3 opacity-50" />
              <span className="truncate text-xs">Choice</span>
            </div>
          </div>
        ) : (
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
                    ? isNarrator
                      ? "hsl(var(--muted-foreground))"
                      : speakerColor
                    : "hsl(var(--muted-foreground))",
                fontStyle: speakerFontStyle,
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
                // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
                role="listbox"
                aria-label="Select speaker"
                aria-activedescendant={
                  focusedOptionIndex >= 0
                    ? `${dropdownId}-option-${focusedOptionIndex}`
                    : undefined
                }
                onKeyDown={handleDropdownKeyDown}
                tabIndex={0}
                className={`absolute z-50 bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 py-1 min-w-[160px] max-h-[280px] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] animate-in fade-in-0 zoom-in-95 duration-200 ease-out ${
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

                <hr className="my-1 border-t border-border" />

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
                      color:
                        entry.speakerId === char.id ? char.color : undefined,
                      fontWeight:
                        entry.speakerId === char.id ? "600" : "normal",
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
        )}

        {/* Text Content — textarea is always mounted to prevent height shift.
            When blurred: textarea is opacity-0 + pointer-events-none (invisible,
            not clickable). The rendered overlay sits on top with
            pointer-events-auto, intercepting clicks. On click, we map the
            rendered position to the raw-text position via caretRangeFromPoint,
            then focus the textarea and set the caret precisely. */}
        <div className={`relative ${isStacked ? "w-full" : "flex-1"}`}>
          <textarea
            ref={(el) => {
              internalTextareaRef.current = el;
              if (textareaRef) textareaRef(el);
            }}
            defaultValue={entry.text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={
              isChoice
                ? "Choice text..."
                : entry.speakerId
                  ? "Dialogue..."
                  : "Narration..."
            }
            className={`min-h-[2.5rem] w-full p-0 pr-7 resize-none overflow-hidden bg-transparent border-0 outline-none focus-visible:outline-none focus-visible:ring-0 font-light tracking-normal leading-8 placeholder:text-muted-foreground/70 ${
              isFocused
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label={
              isChoice
                ? "Choice text"
                : entry.speakerId
                  ? "Dialogue text"
                  : "Narration text"
            }
            // aria-hidden and tabIndex are coordinated: when not focused the
            // textarea is hidden from AT AND removed from tab order (tabIndex=-1),
            // yet must stay programmatically focusable so the rendered-line
            // overlay's click handler can call .focus() to enter edit mode.
            // react-doctor-disable-next-line react-doctor/no-aria-hidden-on-focusable
            aria-hidden={!isFocused}
            tabIndex={isFocused ? 0 : -1}
            style={{
              fontSize: "var(--prose-editor-font-size, 16px)",
              fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
              fontStyle: speakerFontStyle,
              color: "hsl(var(--foreground))",
            }}
          />
          {!isFocused && (
            <button
              type="button"
              onClick={handleRenderedLineClick}
              data-rendered-line-wrapper="true"
              aria-label={
                isChoice
                  ? "Edit choice text"
                  : entry.speakerId
                    ? "Edit dialogue text"
                    : "Edit narration text"
              }
              className="absolute inset-0 pr-7 cursor-text leading-8 text-left bg-transparent border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm overflow-hidden"
              style={{
                fontSize: "var(--prose-editor-font-size, 16px)",
                fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
                fontStyle: speakerFontStyle,
                color: "hsl(var(--foreground))",
              }}
            >
              <RenderedLine
                tokens={renderedTokens}
                className="font-light tracking-normal leading-8"
              />
            </button>
          )}
        </div>

        {/* Delete Button */}
        {showDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="z-10 absolute right-0 top-0.5 p-1 rounded text-muted-foreground/70 hover:text-destructive bg-background/90 hover:bg-destructive/10 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title="Delete line (Backspace)"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Destination indicator for CHOICE entries — placed below the text row */}
      {isChoice && choiceTargetName && (
        <span
          className={`text-xs text-muted-foreground/70 flex items-center gap-1 ${
            isStacked ? "" : "ml-[172px]"
          }`}
        >
          <ArrowUpRight className="size-3" />
          {choiceTargetName}
        </span>
      )}

      {/* Hint shown when user tries to empty a CHOICE */}
      {showRemoveHint && (
        <span
          className={`text-xs text-muted-foreground/70 animate-in fade-in-0 slide-in-from-top-1 duration-200 ${
            isStacked ? "" : "ml-[172px]"
          }`}
        >
          Remove choices in Script mode
        </span>
      )}

      {/* Technical Badges - pill container anchored to parent line */}
      {showBadges &&
        technicalInfo &&
        (technicalInfo.choices ||
          technicalInfo.conditions ||
          technicalInfo.jumpTarget ||
          (technicalInfo.visuals && technicalInfo.visuals.length > 0)) && (
          <div
            className={`mt-1 mb-3 relative ${isStacked ? "" : "ml-[172px]"}`}
          >
            <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border-b border-border/40 bg-muted/15">
              {/* Menu choices badge (first per spec stacking order) */}
              {technicalInfo.choices && technicalInfo.choices.length > 0 && (
                <TechnicalBadge
                  type="menu"
                  data={technicalInfo.choices}
                  isLineHovered={isHovered}
                  onClick={() =>
                    setPopoverType((prev) => (prev === "menu" ? null : "menu"))
                  }
                />
              )}

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
            {popoverType === "menu" && technicalInfo.choices && (
              <TechnicalPopover
                type="menu"
                data={technicalInfo.choices}
                onClose={() => setPopoverType(null)}
              />
            )}
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
