/**
 * Prose Converter Unit Tests
 */

import { describe, it, expect } from "vitest";
import { dialogueToPayload, findDialogueInsertIndex } from "../prose-converter";
import type { DialogueEntry } from "../prose-types";

describe("dialogueToPayload", () => {
  it("should convert dialogue entries to payload format", () => {
    const entries: DialogueEntry[] = [
      { id: "1", speakerId: "uuid-123", text: "Hello world" },
      { id: "2", speakerId: null, text: "Narration text" },
    ];

    const result = dialogueToPayload(entries);

    expect(result).toEqual([
      { speakerId: "uuid-123", text: "Hello world" },
      { speakerId: null, text: "Narration text" },
    ]);
  });

  it("should filter out entries with empty text", () => {
    const entries: DialogueEntry[] = [
      { id: "1", speakerId: "uuid-123", text: "Hello world" },
      { id: "2", speakerId: "uuid-456", text: "" }, // Empty - should be filtered
      { id: "3", speakerId: null, text: "Narration" },
    ];

    const result = dialogueToPayload(entries);

    expect(result).toEqual([
      { speakerId: "uuid-123", text: "Hello world" },
      { speakerId: null, text: "Narration" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("should filter out entries with whitespace-only text", () => {
    const entries: DialogueEntry[] = [
      { id: "1", speakerId: "uuid-123", text: "Hello world" },
      { id: "2", speakerId: "uuid-456", text: "   " }, // Whitespace only - should be filtered
      { id: "3", speakerId: null, text: "Narration" },
    ];

    const result = dialogueToPayload(entries);

    expect(result).toEqual([
      { speakerId: "uuid-123", text: "Hello world" },
      { speakerId: null, text: "Narration" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("should preserve text with leading/trailing whitespace", () => {
    const entries: DialogueEntry[] = [
      { id: "1", speakerId: "uuid-123", text: "  Hello world  " },
    ];

    const result = dialogueToPayload(entries);

    expect(result).toEqual([
      { speakerId: "uuid-123", text: "  Hello world  " },
    ]);
  });

  it("should return empty array when all entries are empty", () => {
    const entries: DialogueEntry[] = [
      { id: "1", speakerId: "uuid-123", text: "" },
      { id: "2", speakerId: "uuid-456", text: "   " },
    ];

    const result = dialogueToPayload(entries);

    expect(result).toEqual([]);
  });

  it("should handle empty input array", () => {
    const result = dialogueToPayload([]);
    expect(result).toEqual([]);
  });
});

describe("findDialogueInsertIndex", () => {
  const menuPrompt: DialogueEntry = {
    id: "prompt",
    speakerId: null,
    text: "Are you over 18?",
  };
  const choice1: DialogueEntry = {
    id: "c1",
    speakerId: null,
    text: "Yes",
    contentType: "CHOICE",
    choiceData: {
      lineId: "menu-1",
      optionIndex: 0,
      targetLabelId: "t1",
      targetLabelName: "yes",
    },
  };
  const choice2: DialogueEntry = {
    id: "c2",
    speakerId: null,
    text: "No",
    contentType: "CHOICE",
    choiceData: {
      lineId: "menu-1",
      optionIndex: 1,
      targetLabelId: "t2",
      targetLabelName: "no",
    },
  };
  const after: DialogueEntry = {
    id: "after",
    speakerId: null,
    text: "After menu",
  };

  const entries = [menuPrompt, choice1, choice2, after];

  it("inserts after the choice block when Enter is on the menu prompt", () => {
    expect(findDialogueInsertIndex(entries, 0)).toBe(3);
  });

  it("inserts after the choice block when Enter is on the first choice", () => {
    expect(findDialogueInsertIndex(entries, 1)).toBe(3);
  });

  it("inserts after the choice block when Enter is on the last choice", () => {
    expect(findDialogueInsertIndex(entries, 2)).toBe(3);
  });

  it("inserts at index+1 for normal dialogue", () => {
    expect(findDialogueInsertIndex(entries, 3)).toBe(4);
  });

  it("inserts after choices when menu is at end of list", () => {
    const menuOnly = [menuPrompt, choice1, choice2];
    expect(findDialogueInsertIndex(menuOnly, 0)).toBe(3);
    expect(findDialogueInsertIndex(menuOnly, 2)).toBe(3);
  });
});
