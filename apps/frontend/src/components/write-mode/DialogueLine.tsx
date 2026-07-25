/**
 * DialogueLine Component
 *
 * Individual dialogue/narration line component with speaker dropdown.
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
import { X, ArrowUpRight } from "lucide-react";
import { tokenize } from "@/lib/renpy-tags";
import { getRawOffsetFromPoint } from "./utils/rawOffset";
import { SpeakerDropdown } from "./SpeakerDropdown";
import { LineTextArea } from "./LineTextArea";
import { TechnicalBadgeRow } from "./TechnicalBadgeRow";
import type { DialogueLineProps } from "./DialogueLine.types";
import { areDialogueLinePropsEqual } from "./DialogueLine.types";

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
  const isDropdownOpenRef = useRef(false);
  const dropdownId = useId();
  const textOnChangeRef = useRef(onChange);
  const previousTextRef = useRef(entry.text);
  const measureRef = useRef<HTMLSpanElement>(null);
  const isChoice = entry.contentType === "CHOICE";

  const resizeTextarea = useCallback(() => {
    const ta = internalTextareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    textOnChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const ta = internalTextareaRef.current;
    if (ta && ta.value !== entry.text) {
      ta.value = entry.text;
      previousTextRef.current = entry.text;
      resizeTextarea();
    }
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- mount-only initial textarea sync; intentional empty deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ta = internalTextareaRef.current;
    if (!ta) return;
    const focused = document.activeElement === ta;
    if (
      !focused &&
      entry.text !== previousTextRef.current &&
      entry.text !== ta.value
    ) {
      ta.value = entry.text;
      previousTextRef.current = entry.text;
      resizeTextarea();
    }
  }, [entry.id, entry.text, resizeTextarea]);

  // react-doctor-disable-next-line react-doctor/advanced-event-handler-refs -- resizeTextarea is transitively stable via refs
  useEffect(() => {
    window.addEventListener("resize", resizeTextarea);
    return () => window.removeEventListener("resize", resizeTextarea);
  }, [resizeTextarea]);

  useEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    const ro = new ResizeObserver(() => resizeTextarea());
    ro.observe(m);
    return () => ro.disconnect();
  }, [resizeTextarea]);

  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- unmount cleanup reading ref.current is correct
  useEffect(() => {
    return () => {
      if (removeHintTimerRef.current) clearTimeout(removeHintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        setIsDropdownOpen(false);
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [isDropdownOpen]);

  const computeDropdownSpaces = useCallback(() => {
    const trigger = dropdownRef.current;
    if (!trigger) return null;
    const scrollArea = trigger.closest(
      '[data-prose-editor-scroll="true"]'
    ) as HTMLElement | null;
    const bounds = scrollArea
      ? scrollArea.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const rect = trigger.getBoundingClientRect();
    return {
      spaceAbove: rect.top - bounds.top,
      spaceBelow: bounds.bottom - rect.bottom,
      triggerRect: rect,
    };
  }, []);

  const updateDropdownDirection = useCallback(() => {
    const menu = dropdownMenuRef.current;
    if (!menu) return;
    const spaces = computeDropdownSpaces();
    if (!spaces) return;
    const mh = Math.min(menu.scrollHeight, 280) + 8;
    setOpenUpward(
      spaces.spaceBelow < mh && spaces.spaceAbove > spaces.spaceBelow
    );
  }, [computeDropdownSpaces]);

  const getShouldOpenUpward = useCallback(
    (mh: number) => {
      const spaces = computeDropdownSpaces();
      return spaces
        ? spaces.spaceBelow < mh && spaces.spaceAbove > spaces.spaceBelow
        : false;
    },
    [computeDropdownSpaces]
  );

  const estimateDropdownHeight = useCallback(
    () => Math.min(40 * (characters.length + 1) + 8, 280) + 8,
    [characters.length]
  );

  const handleSpeakerToggle = useCallback(() => {
    const nextOpen = !isDropdownOpenRef.current;
    if (nextOpen) {
      setOpenUpward(getShouldOpenUpward(estimateDropdownHeight()));
      setFocusedOptionIndex(
        entry.speakerId
          ? characters.findIndex((c) => c.id === entry.speakerId) + 1
          : 0
      );
    } else {
      setFocusedOptionIndex(-1);
    }
    isDropdownOpenRef.current = nextOpen;
    setIsDropdownOpen(nextOpen);
  }, [
    getShouldOpenUpward,
    estimateDropdownHeight,
    entry.speakerId,
    characters,
  ]);

  // react-doctor-disable-next-line react-doctor/advanced-event-handler-refs -- updateDropdownDirection transitively stable
  useEffect(() => {
    if (!isDropdownOpen) return;
    const scrollArea = dropdownRef.current?.closest(
      '[data-prose-editor-scroll="true"]'
    ) as HTMLElement | null;
    const raf = requestAnimationFrame(updateDropdownDirection);
    window.addEventListener("resize", updateDropdownDirection);
    scrollArea?.addEventListener("scroll", updateDropdownDirection, {
      passive: true,
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateDropdownDirection);
      scrollArea?.removeEventListener("scroll", updateDropdownDirection);
    };
  }, [isDropdownOpen, updateDropdownDirection]);

  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler -- focus option scroll is UI sync for keyboard nav, not a fake event handler
    if (isDropdownOpen && focusedOptionIndex >= 0) {
      const opt = document.getElementById(
        `${dropdownId}-option-${focusedOptionIndex}`
      );
      if (opt && typeof opt.scrollIntoView === "function") {
        opt.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }, [focusedOptionIndex, isDropdownOpen, dropdownId]);

  useEffect(() => {
    if (isDropdownOpen) dropdownMenuRef.current?.focus();
    else if (wasDropdownOpenRef.current) speakerButtonRef.current?.focus();
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
      previousTextRef.current = e.target.value;
      textOnChangeRef.current({
        id: entry.id,
        speakerId: entry.speakerId,
        text: e.target.value,
        contentType: entry.contentType,
        choiceData: entry.choiceData,
      });
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
      const total = characters.length + 1;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedOptionIndex((p) => (p < total - 1 ? p + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedOptionIndex((p) => (p > 0 ? p - 1 : total - 1));
          break;
        case "Home":
          e.preventDefault();
          setFocusedOptionIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedOptionIndex(total - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedOptionIndex === 0) handleSpeakerSelect(null);
          else if (focusedOptionIndex > 0) {
            const c = characters[focusedOptionIndex - 1];
            if (c) handleSpeakerSelect(c.id);
          }
          break;
      }
    },
    [characters, focusedOptionIndex, handleSpeakerSelect]
  );

  const handleRenderedLineClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const ta = internalTextareaRef.current;
      if (!ta) return;
      const pos = getRawOffsetFromPoint(e.clientX, e.clientY);
      ta.focus();
      if (pos !== null) ta.setSelectionRange(pos, pos);
    },
    []
  );

  const handleDropdownBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget))
        setTimeout(() => {
          setIsDropdownOpen(false);
          setFocusedOptionIndex(-1);
        }, 0);
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
  const speakerFontStyle = !hasSpeaker || isNarrator ? "italic" : "normal";
  const choiceTargetName = entry.choiceData?.targetLabelName;
  const showDelete =
    (isHovered || entry.text === "") && totalEntries > 1 && !isChoice;
  const gapClass = isStacked
    ? "flex-col gap-1.5 py-2"
    : "flex-col gap-1 py-1.5";
  const wrapperClass = `group relative transition-colors${isChoice ? " pl-3" : ""} ${gapClass}`;
  const renderedTokens = useMemo(() => tokenize(entry.text), [entry.text]);

  return (
    <div
      className={wrapperClass}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex ${isStacked ? "flex-col gap-1.5" : "items-start gap-3"}`}
      >
        <SpeakerDropdown
          isChoice={isChoice}
          isStacked={isStacked}
          isDropdownOpen={isDropdownOpen}
          isSpeakerInteractive={isSpeakerInteractive}
          character={character}
          speakerColor={speakerColor}
          isNarrator={isNarrator}
          speakerFontStyle={speakerFontStyle}
          openUpward={openUpward}
          focusedOptionIndex={focusedOptionIndex}
          dropdownId={dropdownId}
          speakerId={entry.speakerId}
          characters={characters}
          handleSpeakerToggle={handleSpeakerToggle}
          handleSpeakerSelect={handleSpeakerSelect}
          handleDropdownKeyDown={handleDropdownKeyDown}
          handleDropdownBlur={handleDropdownBlur}
          dropdownRef={dropdownRef}
          dropdownMenuRef={dropdownMenuRef}
          speakerButtonRef={speakerButtonRef}
        />

        <LineTextArea
          entry={entry}
          isFocused={isFocused}
          isChoice={isChoice}
          isStacked={isStacked}
          speakerFontStyle={speakerFontStyle}
          renderedTokens={renderedTokens}
          textareaRef={textareaRef}
          internalTextareaRef={internalTextareaRef}
          handleTextChange={handleTextChange}
          handleKeyDown={handleKeyDown}
          handleRenderedLineClick={handleRenderedLineClick}
          setIsFocused={setIsFocused}
        />

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

      {isChoice && choiceTargetName && (
        <span
          className={`text-xs text-muted-foreground/70 flex items-center gap-1 ${isStacked ? "" : "ml-[172px]"}`}
        >
          <ArrowUpRight className="size-3" />
          {choiceTargetName}
        </span>
      )}

      {showRemoveHint && (
        <span
          className={`text-xs text-muted-foreground/70 animate-in fade-in-0 slide-in-from-top-1 duration-200 ${isStacked ? "" : "ml-[172px]"}`}
        >
          Remove choices in Script mode
        </span>
      )}

      <TechnicalBadgeRow
        showBadges={showBadges}
        technicalInfo={technicalInfo}
        isHovered={isHovered}
        isStacked={isStacked}
        popoverType={popoverType}
        setPopoverType={setPopoverType}
      />

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
