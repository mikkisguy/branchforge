/**
 * DialogueLine Component
 *
 * Individual dialogue/narration line component with speaker dropdown.
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { tokenize } from "@/lib/renpy-tags";
import { getRawOffsetFromPoint } from "./utils/rawOffset";
import { SpeakerDropdown } from "./SpeakerDropdown";
import { LineTextArea } from "./LineTextArea";
import { TechnicalBadgeRow } from "./TechnicalBadgeRow";
import type { DialogueLineProps } from "./DialogueLine.types";
import { areDialogueLinePropsEqual } from "./DialogueLine.types";
import { useDialogueLineSpeaker } from "./useDialogueLineSpeaker";
import { DialogueLineActions } from "./DialogueLineActions";

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
  const [popoverType, setPopoverType] = useState<
    "conditions" | "jump" | "visuals" | "menu" | null
  >(null);
  const [showRemoveHint, setShowRemoveHint] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const removeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textOnChangeRef = useRef(onChange);
  const previousTextRef = useRef(entry.text);
  const measureRef = useRef<HTMLSpanElement>(null);
  const isChoice = entry.contentType === "CHOICE";

  const speaker = useDialogueLineSpeaker(entry, characters, onChange);

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
  }, []);
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

  const character = entry.speakerId
    ? characters.find((c) => c.id === entry.speakerId)
    : null;
  const speakerColor = character?.color;
  const isNarrator = character?.isNarrator ?? false;
  const isStacked = layoutMode === "stacked";
  const isSpeakerInteractive = isHovered || speaker.isDropdownOpen;
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
          isDropdownOpen={speaker.isDropdownOpen}
          isSpeakerInteractive={isSpeakerInteractive}
          character={character}
          speakerColor={speakerColor}
          isNarrator={isNarrator}
          speakerFontStyle={speakerFontStyle}
          openUpward={speaker.openUpward}
          focusedOptionIndex={speaker.focusedOptionIndex}
          dropdownId={speaker.dropdownId}
          speakerId={entry.speakerId}
          characters={characters}
          handleSpeakerToggle={speaker.handleSpeakerToggle}
          handleSpeakerSelect={speaker.handleSpeakerSelect}
          handleDropdownKeyDown={speaker.handleDropdownKeyDown}
          handleDropdownBlur={speaker.handleDropdownBlur}
          dropdownRef={speaker.dropdownRef}
          dropdownMenuRef={speaker.dropdownMenuRef}
          speakerButtonRef={speaker.speakerButtonRef}
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
      </div>

      <DialogueLineActions
        visibility={{
          showDelete,
          isChoice,
          isStacked,
          showRemoveHint,
        }}
        onDelete={onDelete}
        choiceTargetName={choiceTargetName}
      />

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
