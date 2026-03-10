/**
 * Hash Utilities Unit Tests
 *
 * Tests for centralized content hashing functions in src/lib/hash.ts
 * Focuses on cross-format compatibility and speaker detection.
 */

import { describe, it, expect } from "vitest";
import {
  calculateContentHash,
  calculateLinesHash,
  calculateDialogueHash,
} from "../hash.js";

describe("calculateContentHash", () => {
  it("should return consistent SHA-256 hash for same input", () => {
    const input = "Hello world";
    const hash1 = calculateContentHash(input);
    const hash2 = calculateContentHash(input);
    expect(hash1).toBe(hash2);
  });

  it("should return different hashes for different inputs", () => {
    const hash1 = calculateContentHash("Hello world");
    const hash2 = calculateContentHash("Hello there");
    expect(hash1).not.toBe(hash2);
  });

  it("should handle empty string", () => {
    const hash = calculateContentHash("");
    expect(hash).toBe(
      "e3b0c44298fc1c149af4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("should handle unicode characters", () => {
    const hash = calculateContentHash("Hello 世界");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toHaveLength(64);
  });
});

describe("calculateDialogueHash", () => {
  it("should include speaker information in hash", () => {
    const dialogueWithSpeaker = [{ speaker: "alice", text: "Hello" }];
    const dialogueWithDifferentSpeaker = [{ speaker: "bob", text: "Hello" }];
    const dialogueWithoutSpeaker = [{ speaker: null, text: "Hello" }];

    const hash1 = calculateDialogueHash(dialogueWithSpeaker);
    const hash2 = calculateDialogueHash(dialogueWithDifferentSpeaker);
    const hash3 = calculateDialogueHash(dialogueWithoutSpeaker);

    expect(hash1).not.toBe(hash2); // Different speaker
    expect(hash1).not.toBe(hash3); // Speaker vs null speaker
  });

  it("should handle empty dialogue array", () => {
    const hash = calculateDialogueHash([]);
    expect(hash).toBe(
      "e3b0c44298fc1c149af4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("should handle multiple dialogue entries", () => {
    const dialogue = [
      { speaker: "alice", text: "Hello" },
      { speaker: "bob", text: "Hi there" },
      { speaker: null, text: "Narration here" },
    ];
    const hash = calculateDialogueHash(dialogue);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("calculateLinesHash - Cross-format compatibility", () => {
  describe("Database format ({ content: string })", () => {
    it("should hash dialogue with speaker stored in content", () => {
      const lines = [{ content: "alice:Hello" }, { content: "bob:Hi there" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash narration (leading colon) stored in content", () => {
      const lines = [{ content: ":This is narration" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash jump statements stored in content", () => {
      const lines = [{ content: "jump next_label" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("RPY parser format ({ text?, target? })", () => {
    it("should hash dialogue text entries", () => {
      const lines = [{ text: "Hello" }, { text: "World" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash jump entries with target", () => {
      const lines = [{ target: "next_label" }, { target: "another_label" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should prefer target over text for jump statements", () => {
      const linesWithTarget = [{ target: "label_a", text: "ignored" }];
      const linesWithTextOnly = [{ text: "label_a" }];

      const hash1 = calculateLinesHash(linesWithTarget);
      const hash2 = calculateLinesHash(linesWithTextOnly);

      // target creates "jump label_a", text creates ":label_a"
      expect(hash1).not.toBe(hash2);
    });

    it("should handle missing text and target", () => {
      const lines = [{ text: undefined, target: undefined }];
      const hash = calculateLinesHash(lines);
      // Empty entry contributes empty string to hash
      expect(hash).toBe(
        "e3b0c44298fc1c149af4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });
  });

  describe("BranchForge format ({ type, speaker?, text?, target? })", () => {
    it("should hash DIALOGUE type with speaker", () => {
      const lines = [
        { type: "DIALOGUE", speaker: "alice", text: "Hello" },
        { type: "DIALOGUE", speaker: "bob", text: "Hi" },
      ];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash NARRATION type without speaker", () => {
      const lines = [
        { type: "NARRATION", text: "This is narration" },
        { type: "NARRATION", text: "More narration" },
      ];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash JUMP type with target", () => {
      const lines = [
        { type: "JUMP", target: "next_label" },
        { type: "JUMP", target: "another_label" },
      ];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash FLAG type (menu choices)", () => {
      const lines = [
        { type: "FLAG", text: "Choice A", target: "label_a" },
        { type: "FLAG", text: "Choice B", target: "label_b" },
      ];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle missing text in DIALOGUE entry", () => {
      const lines = [{ type: "DIALOGUE", speaker: "alice", text: undefined }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle missing target in JUMP entry", () => {
      const lines = [{ type: "JUMP", target: undefined }];
      const hash = calculateLinesHash(lines);
      expect(hash).toBe(
        "e3b0c44298fc1c149af4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });
  });

  describe("Dialogue format ({ speaker: string | null, text: string })", () => {
    it("should hash dialogue with speaker", () => {
      const lines = [{ speaker: "alice", text: "Hello" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash narration (null speaker)", () => {
      const lines = [{ speaker: null, text: "This is narration" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should handle empty string speaker", () => {
      const lines = [{ speaker: "", text: "Hello" }];
      const hash = calculateLinesHash(lines);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});

describe("Cross-format hash consistency", () => {
  describe("Dialogue content - speaker included", () => {
    it("should produce same hash for DIALOGUE type and dialogue format with speaker", () => {
      const branchForgeFormat = [
        { type: "DIALOGUE", speaker: "alice", text: "Hello world" },
      ];
      const dialogueFormat = [{ speaker: "alice", text: "Hello world" }];
      const databaseFormat = [{ content: "alice:Hello world" }];

      const hash1 = calculateLinesHash(branchForgeFormat);
      const hash2 = calculateLinesHash(dialogueFormat);
      const hash3 = calculateLinesHash(databaseFormat);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("should detect speaker-only changes across formats", () => {
      const originalAlice = [{ type: "DIALOGUE", speaker: "alice", text: "Hello" }];
      const changedToBob = [{ type: "DIALOGUE", speaker: "bob", text: "Hello" }];
      const changedToNull = [{ type: "DIALOGUE", speaker: null, text: "Hello" }];

      const hashAlice = calculateLinesHash(originalAlice);
      const hashBob = calculateLinesHash(changedToBob);
      const hashNull = calculateLinesHash(changedToNull);

      expect(hashAlice).not.toBe(hashBob);
      expect(hashAlice).not.toBe(hashNull);
      expect(hashBob).not.toBe(hashNull);
    });
  });

  describe("Narration content - no speaker", () => {
    it("should produce same hash for NARRATION type and dialogue format with null speaker", () => {
      const branchForgeFormat = [
        { type: "NARRATION", text: "This is narration" },
      ];
      const dialogueFormat = [{ speaker: null, text: "This is narration" }];
      const databaseFormat = [{ content: ":This is narration" }];

      const hash1 = calculateLinesHash(branchForgeFormat);
      const hash2 = calculateLinesHash(dialogueFormat);
      const hash3 = calculateLinesHash(databaseFormat);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe("Jump statements", () => {
    it("should produce same hash for JUMP type and RPY parser format", () => {
      const branchForgeFormat = [{ type: "JUMP", target: "next_label" }];
      const rpyParserFormat = [{ target: "next_label" }];
      const databaseFormat = [{ content: "jump next_label" }];

      const hash1 = calculateLinesHash(branchForgeFormat);
      const hash2 = calculateLinesHash(rpyParserFormat);
      const hash3 = calculateLinesHash(databaseFormat);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("should treat jump statements distinctly from dialogue", () => {
      const jumpFormat = [{ type: "JUMP", target: "next_label" }];
      const dialogueFormat = [{ speaker: null, text: "next_label" }];

      const hashJump = calculateLinesHash(jumpFormat);
      const hashDialogue = calculateLinesHash(dialogueFormat);

      expect(hashJump).not.toBe(hashDialogue);
    });
  });

  describe("Complex label content", () => {
    it("should hash mixed content consistently across formats", () => {
      // Import path format (BranchForge from RPY)
      const importFormat = [
        { type: "DIALOGUE", speaker: "alice", text: "Hello" },
        { type: "NARRATION", text: "Scene description" },
        { type: "DIALOGUE", speaker: "bob", text: "Hi Alice" },
        { type: "JUMP", target: "next_scene" },
      ];

      // Local edit format (from frontend)
      const localEditFormat = [
        { speaker: "alice", text: "Hello" },
        { speaker: null, text: "Scene description" },
        { speaker: "bob", text: "Hi Alice" },
        { type: "JUMP", target: "next_scene" },
      ];

      // Database format
      const databaseFormat = [
        { content: "alice:Hello" },
        { content: ":Scene description" },
        { content: "bob:Hi Alice" },
        { content: "jump next_scene" },
      ];

      const hash1 = calculateLinesHash(importFormat);
      const hash2 = calculateLinesHash(localEditFormat);
      const hash3 = calculateLinesHash(databaseFormat);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("should handle empty arrays consistently", () => {
      const hash1 = calculateLinesHash([]);
      const hash2 = calculateLinesHash([]);
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(
        "e3b0c44298fc1c149af4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });
  });
});

describe("calculateDialogueHash delegates to calculateLinesHash", () => {
  it("should use same hash implementation as calculateLinesHash", () => {
    const dialogue = [
      { speaker: "alice", text: "Hello" },
      { speaker: null, text: "Narration" },
    ];

    const hashViaDialogue = calculateDialogueHash(dialogue);
    const hashViaLines = calculateLinesHash(dialogue);

    expect(hashViaDialogue).toBe(hashViaLines);
  });
});
