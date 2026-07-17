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
 * Contiguous non-equal runs are coalesced by pairing deletes and inserts into
 * replace ops; unmatched deletes/inserts are preserved in order.
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

  // Coalesce each contiguous non-equal run: pair deletes/inserts by position
  // into replaces, then emit any unmatched deletes or inserts in order.
  const ops: DialogueAlignOp[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === "equal") {
      ops.push(raw[k]);
      k++;
      continue;
    }

    const deletes: number[] = [];
    const inserts: number[] = [];
    while (k < raw.length && raw[k].type !== "equal") {
      const op = raw[k];
      if (op.type === "delete") {
        deletes.push(op.origIndex);
      } else if (op.type === "insert") {
        inserts.push(op.updatedIndex);
      }
      k++;
    }

    const paired = Math.min(deletes.length, inserts.length);
    for (let p = 0; p < paired; p++) {
      ops.push({
        type: "replace",
        origIndex: deletes[p],
        updatedIndex: inserts[p],
      });
    }
    for (let p = paired; p < deletes.length; p++) {
      ops.push({ type: "delete", origIndex: deletes[p] });
    }
    for (let p = paired; p < inserts.length; p++) {
      ops.push({ type: "insert", updatedIndex: inserts[p] });
    }
  }

  return ops;
}
