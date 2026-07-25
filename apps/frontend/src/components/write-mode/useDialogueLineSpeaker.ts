/**
 * useDialogueLineSpeaker
 *
 * Manages speaker dropdown open/close state, positioning, keyboard navigation,
 * focus management, and outside-click dismissal.
 */
import { useState, useCallback, useRef, useEffect, useId } from "react";
import type { Character } from "@branchforge/shared";
import type { DialogueEntry } from "@/lib/prose-types";

export interface UseDialogueLineSpeakerReturn {
  isDropdownOpen: boolean;
  openUpward: boolean;
  focusedOptionIndex: number;
  dropdownId: string;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  dropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  speakerButtonRef: React.RefObject<HTMLButtonElement | null>;
  handleSpeakerToggle: () => void;
  handleSpeakerSelect: (speakerId: string | null) => void;
  handleDropdownKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleDropdownBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
}

export function useDialogueLineSpeaker(
  entry: DialogueEntry,
  characters: Character[],
  onChange: (entry: DialogueEntry) => void
): UseDialogueLineSpeakerReturn {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const speakerButtonRef = useRef<HTMLButtonElement>(null);
  const wasDropdownOpenRef = useRef(false);
  const isDropdownOpenRef = useRef(false);
  const dropdownId = useId();
  const closeDropdown = useCallback(() => {
    isDropdownOpenRef.current = false;
    setIsDropdownOpen(false);
    setFocusedOptionIndex(-1);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        closeDropdown();
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [isDropdownOpen, closeDropdown]);

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

  // Scroll focused option into view
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

  // Focus menu on open, return focus to speaker button on close
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
      closeDropdown();
    },
    [
      onChange,
      entry.id,
      entry.text,
      entry.contentType,
      entry.choiceData,
      closeDropdown,
    ]
  );

  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const total = characters.length + 1;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeDropdown();
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
    [characters, focusedOptionIndex, handleSpeakerSelect, closeDropdown]
  );

  const handleDropdownBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget))
        setTimeout(() => {
          closeDropdown();
        }, 0);
    },
    [closeDropdown]
  );

  return {
    isDropdownOpen,
    openUpward,
    focusedOptionIndex,
    dropdownId,
    dropdownRef,
    dropdownMenuRef,
    speakerButtonRef,
    handleSpeakerToggle,
    handleSpeakerSelect,
    handleDropdownKeyDown,
    handleDropdownBlur,
  };
}
