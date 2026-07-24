/**
 * Conflict Review Dialog — Mock Data
 *
 * Mock conflict data used for UI development and testing.
 * Kept separate from component files to satisfy
 * react-doctor `only-export-components` rule.
 */

import type { ConflictInfo } from "@/lib/api/gitlab";

export const MOCK_CONFLICTS: ConflictInfo[] = [
  {
    label: "start",
    type: "dialogue_mismatch",
    localContent: [
      { speaker: null, text: "The story begins in a small village..." },
      { speaker: "eileen", text: "Hello there, traveler!" },
    ],
    remoteContent: [
      { speaker: null, text: "The story begins in a bustling city..." },
      { speaker: "eileen", text: "Greetings, weary traveler!" },
    ],
  },
  {
    label: "ending_a",
    type: "dialogue_mismatch",
    localContent: [
      { speaker: "protagonist", text: "I choose to follow my heart." },
      { speaker: null, text: "She walked into the sunset, hopeful." },
    ],
    remoteContent: [
      { speaker: "protagonist", text: "I choose to follow my dreams." },
      { speaker: null, text: "She walked into the sunset, determined." },
    ],
  },
];
