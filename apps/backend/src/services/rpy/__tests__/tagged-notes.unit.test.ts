import { describe, it, expect } from "vitest";
import {
  formatTaggedNote,
  formatTaggedNoteLine,
  parseTaggedNotes,
  parseTaggedNoteBlocks,
  isTaggedNoteLine,
  reconstructRPYFile,
} from "../../rpy-parser.service.js";

const NOTE_1 = "11111111-1111-4000-8000-111111111111";
const NOTE_2 = "22222222-2222-4000-8000-222222222222";

describe("tagged notes", () => {
  describe("parse/format", () => {
    it("parses a single-line tagged note", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] Check this line
    e "Hello"`;

      const blocks = parseTaggedNoteBlocks(rpy);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        label: "start",
        dialogueIndex: 0,
        dialogueLine: 2,
        noteId: NOTE_1,
        body: "Check this line",
        noteStartLine: 1,
        noteEndLine: 1,
      });
      expect(parseTaggedNotes(rpy)).toEqual([
        { id: NOTE_1, body: "Check this line" },
      ]);
    });

    it("parses a multi-line tagged note", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] First line
    # BFNOTE[id=${NOTE_1}] Second line
    e "Hello"`;

      const blocks = parseTaggedNoteBlocks(rpy);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].body).toBe("First line\nSecond line");
      expect(blocks[0].noteStartLine).toBe(1);
      expect(blocks[0].noteEndLine).toBe(2);
    });

    it("formats a single tagged note line", () => {
      expect(formatTaggedNoteLine(NOTE_1, "Hello")).toBe(
        `# BFNOTE[id=${NOTE_1}] Hello`
      );
    });

    it("formats a multi-line tagged note", () => {
      expect(formatTaggedNote(NOTE_1, "Line 1\nLine 2")).toEqual([
        `# BFNOTE[id=${NOTE_1}] Line 1`,
        `# BFNOTE[id=${NOTE_1}] Line 2`,
      ]);
    });

    it("preserves indentation when formatting with an indent argument", () => {
      expect(formatTaggedNote(NOTE_1, "Body", "    ")).toEqual([
        `    # BFNOTE[id=${NOTE_1}] Body`,
      ]);
    });

    it("identifies tagged note lines", () => {
      expect(isTaggedNoteLine(`# BFNOTE[id=${NOTE_1}] body`)).toBe(true);
      expect(isTaggedNoteLine("# ordinary comment")).toBe(false);
      expect(isTaggedNoteLine(`# BFNOTE[id=not-a-uuid] body`)).toBe(false);
    });
  });

  describe("boundaries", () => {
    it("does not attach a note to a menu choice", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] dangling
    menu:
        "Choice":
            e "Hello"`;

      const blocks = parseTaggedNoteBlocks(rpy);
      expect(blocks).toHaveLength(0);
      const lines = rpy.split("\n");
      expect(lines.filter((line) => isTaggedNoteLine(line))).toHaveLength(1);
    });

    it("does not attach dangling or malformed tags", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] dangling
    show black

    # BFNOTE[id=malformed] body
    e "Hello"`;

      const blocks = parseTaggedNoteBlocks(rpy);
      expect(blocks).toHaveLength(0);
    });

    it("attaches notes to duplicate adjacent dialogue lines independently", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] first
    e "Same"
    # BFNOTE[id=${NOTE_2}] second
    e "Same"`;

      const blocks = parseTaggedNoteBlocks(rpy);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].dialogueIndex).toBe(0);
      expect(blocks[1].dialogueIndex).toBe(1);
      expect(blocks[0].noteId).toBe(NOTE_1);
      expect(blocks[1].noteId).toBe(NOTE_2);
    });
  });

  describe("reconstruction", () => {
    it("leaves ordinary comments untouched when no notes are supplied", () => {
      const rpy = `label start:
    # Ordinary comment
    e "Hello"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Hello" }]],
        ]),
      });
      expect(result).toBe(rpy);
    });

    it("emits a new note on an unchanged dialogue line", () => {
      const rpy = `label start:
    e "Hello"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Hello", lineId: "line-1" }]],
        ]),
        lineNotes: new Map([["line-1", { id: NOTE_1, body: "Check this" }]]),
      });

      expect(result).toBe(`label start:
    # BFNOTE[id=${NOTE_1}] Check this
    e "Hello"`);
    });

    it("edits a note without duplication", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] Old note
    e "Hello"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Hello", lineId: "line-1" }]],
        ]),
        lineNotes: new Map([["line-1", { id: NOTE_1, body: "New note" }]]),
      });

      expect(result).toBe(`label start:
    # BFNOTE[id=${NOTE_1}] New note
    e "Hello"`);
    });

    it("removes a note when the dialogue slot is rewritten", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] Old note
    e "Hello"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Goodbye", lineId: "line-1" }]],
        ]),
      });

      expect(result).toBe(`label start:
    e "Goodbye"`);
    });

    it("removes a note when the dialogue slot is deleted", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] Old note
    e "Hello"
    e "Goodbye"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Goodbye", lineId: "line-2" }]],
        ]),
      });

      expect(result).toBe(`label start:
    e "Goodbye"`);
    });

    it("emits inserted dialogue together with its note", () => {
      const rpy = `label start:
    e "First"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          [
            "start",
            [
              { speaker: "e", text: "First", lineId: "line-1" },
              { speaker: "e", text: "Inserted", lineId: "line-2" },
            ],
          ],
        ]),
        lineNotes: new Map([["line-2", { id: NOTE_1, body: "Inserted note" }]]),
      });

      expect(result).toBe(`label start:
    e "First"
    # BFNOTE[id=${NOTE_1}] Inserted note
    e "Inserted"`);
    });

    it("preserves plain comments and labels outside the updated set", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] note
    e "Hello"

label other:
    # Plain comment
    e "World"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Hello" }]],
        ]),
      });

      expect(result).toBe(`label start:
    # BFNOTE[id=${NOTE_1}] note
    e "Hello"

label other:
    # Plain comment
    e "World"`);
    });

    it("keeps menu and condition boundaries intact", () => {
      const rpy = `label start:
    menu:
        "Choice":
            # BFNOTE[id=${NOTE_1}] inside menu
            e "Hello"
        "Other":
            e "Bye"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          [
            "start",
            [
              { speaker: "e", text: "Hello", lineId: "line-1" },
              { speaker: "e", text: "Bye", lineId: "line-2" },
            ],
          ],
        ]),
        lineNotes: new Map([["line-1", { id: NOTE_1, body: "updated" }]]),
      });

      expect(result).toBe(`label start:
    menu:
        "Choice":
            # BFNOTE[id=${NOTE_1}] updated
            e "Hello"
        "Other":
            e "Bye"`);
    });

    it("handles replacement with a new note", () => {
      const rpy = `label start:
    # BFNOTE[id=${NOTE_1}] old
    e "Hello"`;

      const result = reconstructRPYFile({
        originalContent: rpy,
        updatedDialogue: new Map([
          ["start", [{ speaker: "e", text: "Goodbye", lineId: "line-1" }]],
        ]),
        lineNotes: new Map([["line-1", { id: NOTE_2, body: "fresh" }]]),
      });

      expect(result).toBe(`label start:
    # BFNOTE[id=${NOTE_2}] fresh
    e "Goodbye"`);
    });
  });
});
