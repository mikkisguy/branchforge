/**
 * Hash Utilities
 *
 * Centralized content hashing functions for tracking changes and enabling
 * idempotent operations. Used for content hash calculation in sync operations.
 */

import { createHash } from "crypto";

/**
 * Calculate SHA-256 hash of content string
 * Used for detecting content changes and enabling idempotency
 *
 * @param content - The content to hash
 * @returns Hex string of SHA-256 hash
 *
 * @example
 * ```ts
 * const hash = calculateContentHash("Hello world");
 * // Returns: "b94d27b9934d3e08a52e52d7da7daac484efe37a5380ee9088f7ace2efcde9"
 * ```
 */
export function calculateContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Normalize various entry formats to canonical string representation.
 * This function handles:
 * - Database format ({ content: string }) - used as-is (already canonical)
 * - RPY parser format ({ text?: string; target?: string })
 * - BranchForge format ({ type, speaker?, text?, target? })
 * - Dialogue format ({ speaker: string | null, text: string })
 *
 * @param entry - Entry in any supported format
 * @returns Canonical string for hashing
 */
function normalizeToCanonicalString(
  entry:
    | { content: string }
    | { text?: string; target?: string }
    | { type?: string; speaker?: string; text?: string; target?: string }
    | { speaker: string | null; text: string }
): string {
  // Handle database canonical format ({ content: string })
  // Content is already in canonical format, use as-is
  if ("content" in entry) {
    return entry.content;
  }

  // Handle BranchForge format with type field
  if ("type" in entry && entry.type) {
    switch (entry.type) {
      case "JUMP":
        return entry.target ? `jump ${entry.target}` : "";
      case "DIALOGUE":
        return `${entry.speaker ?? ""}:${entry.text ?? ""}`;
      case "NARRATION":
        return `:${entry.text ?? ""}`;
      case "FLAG":
        // Menu choice/flag: represent as dialogue with null speaker
        return `:${entry.text ?? ""}`;
      default:
        return "";
    }
  }

  // Handle RPY parser format ({ text?, target? })
  if ("target" in entry && entry.target) {
    return `jump ${entry.target}`;
  }

  // Handle dialogue format ({ speaker: string | null, text: string })
  if ("speaker" in entry && "text" in entry) {
    return `${entry.speaker ?? ""}:${entry.text}`;
  }

  // Fallback: try to extract text from whatever format we have
  if ("text" in entry && entry.text) {
    return `:${entry.text}`;
  }

  return "";
}

/**
 * Calculate combined hash of label lines with canonical representation.
 * This is the unified hash function for all label content, ensuring consistency
 * across import (RPY parsing) and local edit paths.
 *
 * Supports multiple input formats:
 * - Database format: Array<{ content: string }>
 * - RPY parser format: Array<{ text?: string; target?: string }>
 * - BranchForge format: Array<{ type: string; speaker?: string; text?: string; target?: string }>
 * - Dialogue format: Array<{ speaker: string | null; text: string }>
 *
 * @param lines - Array of entries in any supported format
 * @returns Hex string of SHA-256 hash
 *
 * @example
 * ```ts
 * // Database format
 * const hash1 = calculateLinesHash([
 *   { content: "alice:Hello" },
 *   { content: "jump next_label" },
 * ]);
 *
 * // BranchForge format (import from RPY)
 * const hash2 = calculateLinesHash([
 *   { type: "DIALOGUE", speaker: "alice", text: "Hello" },
 *   { type: "JUMP", target: "next_label" },
 * ]);
 * // hash1 === hash2 (same content, same hash)
 *
 * // Dialogue format (local edit)
 * const hash3 = calculateLinesHash([
 *   { speaker: "alice", text: "Hello" },
 * ]);
 * // hash3 matches equivalent content in other formats
 * ```
 */
export function calculateLinesHash(
  lines: Array<
    | { content: string }
    | { text?: string; target?: string }
    | { type?: string; speaker?: string; text?: string; target?: string }
    | { speaker: string | null; text: string }
  >
): string {
  const combined = lines.map(normalizeToCanonicalString).join("\n");
  return calculateContentHash(combined);
}

/**
 * Calculate hash of dialogue array.
 * Legacy function maintained for backward compatibility.
 * Delegates to calculateLinesHash for consistent hashing.
 *
 * @param dialogue - Array of dialogue entries with speaker and text
 * @returns Hex string of SHA-256 hash
 *
 * @example
 * ```ts
 * const hash = calculateDialogueHash([
 *   { speaker: "alice", text: "Hello" },
 *   { speaker: null, text: "Narration" },
 * ]);
 * ```
 */
export function calculateDialogueHash(
  dialogue: Array<{ speaker: string | null; text: string }>
): string {
  return calculateLinesHash(dialogue);
}
