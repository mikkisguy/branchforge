/**
 * Prose Converter Unit Tests
 */

import { describe, it, expect } from "vitest";
import { dialogueToPayload } from "../prose-converter";
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
