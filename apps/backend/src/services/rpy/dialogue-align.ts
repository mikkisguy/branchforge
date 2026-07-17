/**
 * Sequence alignment for Write Mode dialogue lists.
 *
 * Aligns original dialogue entries against an updated list using LCS,
 * producing equal / replace / insert / delete ops. Used by RPY reconstruction
 * and the dialogue-save DB update path so mid-list inserts do not slide
 * later lines into the wrong scene/show slots.
 */

export interface DialogueAlignEntry {
  speaker: string | null;
  text: string;
}

export type DialogueAlignOp =
  | { type: "equal"; origIndex: number; updatedIndex: number }
  | { type: "replace"; origIndex: number; updatedIndex: number }
  | { type: "insert"; updatedIndex: number }
  | { type: "delete"; origIndex: number };

export function dialogueEntriesEqual(
  a: DialogueAlignEntry,
  b: DialogueAlignEntry
): boolean {
  return a.speaker === b.speaker && a.text === b.text;
}

/**
 * Align `original` against `updated` via LCS.
 * Adjacent delete+insert pairs are coalesced into replace (in-place edits).
 */
export function alignDialogue(
  original: DialogueAlignEntry[],
  updated: DialogueAlignEntry[]
): DialogueAlignOp[] {
  const n = original.length;
  const m = updated.length;

  // dp[i][j] = LCS length of original[i..] and updated[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (dialogueEntriesEqual(original[i], updated[j])) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const raw: DialogueAlignOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (dialogueEntriesEqual(original[i], updated[j])) {
      raw.push({ type: "equal", origIndex: i, updatedIndex: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "delete", origIndex: i });
      i++;
    } else {
      raw.push({ type: "insert", updatedIndex: j });
      j++;
    }
  }
  while (i < n) {
    raw.push({ type: "delete", origIndex: i });
    i++;
  }
  while (j < m) {
    raw.push({ type: "insert", updatedIndex: j });
    j++;
  }

  // Coalesce adjacent delete+insert into replace
  const ops: DialogueAlignOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k];
    const next = raw[k + 1];
    if (cur.type === "delete" && next?.type === "insert") {
      ops.push({
        type: "replace",
        origIndex: cur.origIndex,
        updatedIndex: next.updatedIndex,
      });
      k++;
    } else if (cur.type === "insert" && next?.type === "delete") {
      ops.push({
        type: "replace",
        origIndex: next.origIndex,
        updatedIndex: cur.updatedIndex,
      });
      k++;
    } else {
      ops.push(cur);
    }
  }

  return ops;
}
