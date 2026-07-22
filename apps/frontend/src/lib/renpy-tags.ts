/**
 * Ren'Py text tag tokenizer.
 *
 * Ren'Py dialogue text can contain inline tags in curly braces that control
 * styling, timing, and flow. Examples:
 *   {b}bold{/b}            - bold
 *   {color=#f00}red{/color} - red text
 *   {size=+5}big{/size}    - larger text
 *   {w}                    - pause (self-closing)
 *   [variable]             - interpolation (handled separately)
 *
 * This module produces a flat stream of tokens that the UI can render. It is
 * deliberately **lossless** with respect to the source string: re-stringifying
 * the tokens yields the original input byte-for-byte. Anything we cannot
 * recognize round-trips as `text` (the literal characters) plus a `malformed`
 * marker on the enclosing token so the UI can show a warning.
 *
 * Variable interpolation (`[name]`) is **not** treated as a tag — it is its own
 * token type so the UI can render it as a variable reference.
 *
 * Reference (v1 scope): b, i, u, s, color, size, font, alpha, cps, w, p, nw,
 * fast, clear, done. Self-closing tags have no `/` form.
 */

export type RenpyToken =
  | { kind: "text"; value: string }
  | { kind: "open"; tag: RenpyTag; raw: string; value?: string }
  | { kind: "close"; tag: RenpyTag; raw: string }
  | { kind: "self"; tag: RenpySelfTag; raw: string }
  | { kind: "interpolation"; name: string; raw: string }
  | { kind: "newline"; raw: string }
  | { kind: "malformed"; raw: string };

/** Tags that have a matching close tag (`{/tag}`). */
export type RenpyTag =
  "b" | "i" | "u" | "s" | "color" | "size" | "font" | "alpha" | "cps";

/** Tags that stand alone (no close form). */
export type RenpySelfTag = "w" | "p" | "nw" | "fast" | "clear" | "done";

const CLOSEABLE_TAGS: ReadonlySet<RenpyTag> = new Set<RenpyTag>([
  "b",
  "i",
  "u",
  "s",
  "color",
  "size",
  "font",
  "alpha",
  "cps",
]);

const SELF_TAGS: ReadonlySet<RenpySelfTag> = new Set<RenpySelfTag>([
  "w",
  "p",
  "nw",
  "fast",
  "clear",
  "done",
]);

/**
 * Tokenize a single line of Ren'Py dialogue text.
 *
 * The tokenizer is single-pass and character-based. It does not validate
 * nesting balance — a missing close is just a raw `text` span followed by the
 * remaining text. Unknown tags are emitted as `open` tokens with `tag` set to
 * a synthetic `unknown` value... actually, to preserve losslessness, unknown
 * tags are emitted as `text` for the `{...}` and the consumer can show them
 * verbatim. To keep the type surface small, we treat unknown braces as
 * `malformed` and include the literal characters in `raw`.
 *
 * @example
 *   tokenize("Hi {b}there{/b}!")
 *   // [
 *   //   { kind: "text", value: "Hi " },
 *   //   { kind: "open", tag: "b", raw: "{b}" },
 *   //   { kind: "text", value: "there" },
 *   //   { kind: "close", tag: "b", raw: "{/b}" },
 *   //   { kind: "text", value: "!" },
 *   // ]
 */
export function tokenize(input: string): RenpyToken[] {
  const tokens: RenpyToken[] = [];
  let i = 0;
  let textStart = 0;
  const flushText = (end: number): void => {
    if (end > textStart) {
      tokens.push({ kind: "text", value: input.slice(textStart, end) });
    }
  };

  while (i < input.length) {
    const ch = input[i]!;

    // Escape sequences: \n (newline), \t (tab).
    // These are literal two-character sequences in the source text that
    // should render as actual whitespace in the prose editor.
    if (ch === "\\" && i + 1 < input.length) {
      const next = input[i + 1]!;
      if (next === "n") {
        flushText(i);
        tokens.push({ kind: "newline", raw: "\\n" });
        i += 2;
        textStart = i;
        continue;
      }
      if (next === "t") {
        flushText(i);
        tokens.push({ kind: "newline", raw: "\\t" });
        i += 2;
        textStart = i;
        continue;
      }
      // Other backslash sequences: treat as literal text.
    }

    // Variable interpolation: [name] — letters, digits, underscore, dot.
    if (ch === "[") {
      const close = findInterpolationClose(input, i + 1);
      if (close !== -1) {
        const name = input.slice(i + 1, close);
        if (isValidInterpolationName(name)) {
          flushText(i);
          tokens.push({
            kind: "interpolation",
            name,
            raw: input.slice(i, close + 1),
          });
          i = close + 1;
          textStart = i;
          continue;
        }
      }
      // Fall through — treat as literal '['.
    }

    // Tag: { ... }
    if (ch === "{") {
      const close = findTagClose(input, i + 1);
      if (close !== -1) {
        const raw = input.slice(i, close + 1);
        const inner = input.slice(i + 1, close);

        if (isWellFormedTagInner(inner)) {
          flushText(i);
          const token = parseTag(inner, raw);
          if (token) {
            tokens.push(token);
          } else {
            // Well-formed shape but unrecognized tag name (e.g. `{whatever}`).
            // Keep as text so the user sees the literal characters — this
            // preserves losslessness and lets unknown-but-valid Ren'Py tags
            // render neutrally in the prose editor.
            tokens.push({ kind: "text", value: raw });
          }
          i = close + 1;
          textStart = i;
          continue;
        }

        // Malformed: braces present but inner is not a valid tag shape.
        flushText(i);
        tokens.push({ kind: "malformed", raw });
        i = close + 1;
        textStart = i;
        continue;
      }

      // Unterminated `{` — treat the rest of the line as literal text.
      break;
    }

    i++;
  }

  flushText(input.length);
  return coalesceAdjacentText(tokens);
}

/**
 * Re-stringify tokens back into the original source. Used by tests to assert
 * losslessness and by future export logic if a consumer ever mutates tokens
 * (e.g. a hover preview that strips styling).
 */
export function stringify(tokens: RenpyToken[]): string {
  return tokens
    .map((t) => {
      switch (t.kind) {
        case "text":
          return t.value;
        case "malformed":
        case "open":
        case "close":
        case "self":
        case "interpolation":
        case "newline":
          return t.raw;
      }
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Find the matching `}` for a tag starting after position `start`. Returns the
 * index of the `}` or -1 if no valid terminator is found before end-of-string
 * or before a stray `{` (Ren'Py does not allow nesting braces inside a tag).
 */
function findTagClose(input: string, start: number): number {
  for (let j = start; j < input.length; j++) {
    const c = input[j]!;
    if (c === "}") return j;
    if (c === "{") return -1;
    if (c === "\n" || c === "\r") return -1;
  }
  return -1;
}

/**
 * Find the matching `]` for a `[name]` interpolation. Returns the index of
 * the `]` or -1. Allows alphanumerics, underscore, and dot inside the name.
 */
function findInterpolationClose(input: string, start: number): number {
  if (start >= input.length) return -1;
  for (let j = start; j < input.length; j++) {
    const c = input[j]!;
    if (c === "]") {
      // Must have at least one char of name and not be empty `[]`.
      return j > start ? j : -1;
    }
    if (!(
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "_" ||
      c === "."
    )) {
      return -1;
    }
  }
  return -1;
}

function isValidInterpolationName(name: string): boolean {
  if (name.length === 0) return false;
  // First char must be a letter or underscore (matches Python identifier rules
  // for what Ren'Py authors typically use).
  const first = name[0]!;
  if (!(
    (first >= "a" && first <= "z") ||
    (first >= "A" && first <= "Z") ||
    first === "_"
  )) {
    return false;
  }
  for (let k = 1; k < name.length; k++) {
    const c = name[k]!;
    if (!(
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "_" ||
      c === "."
    )) {
      return false;
    }
  }
  return true;
}

/**
 * Classify a tag name string into the typed union, or null if it isn't a
 * recognized tag. We do this in one place so `isValidTagInner` and
 * `parseTag` don't fight over a `string` vs `RenpyTag` boundary.
 */
function classifyTagName(name: string): RenpyTag | RenpySelfTag | null {
  if (CLOSEABLE_TAGS.has(name as RenpyTag)) return name as RenpyTag;
  if (SELF_TAGS.has(name as RenpySelfTag)) return name as RenpySelfTag;
  return null;
}

/**
 * A tag's interior is well-formed if it matches one of:
 *   - a bare tag name (e.g. `b`, `w`, `whatever`)
 *   - a tag name with `=value` (e.g. `color=#f00`, `size=+5`, `font=arial.ttf`)
 *   - a closing tag (`/b`, `/color`)
 *
 * Note: this only checks *shape*, not whether the tag name is recognized.
 * Unknown-but-well-formed tags (e.g. `{whatever}`) round-trip as a `text`
 * token so the user sees the literal characters — they may be using a
 * Ren'Py feature outside our known set, or pasting from elsewhere.
 * Truly malformed input (empty `{}`, `{b=}`, unterminated) becomes a
 * `malformed` token for the UI to flag.
 */
function isWellFormedTagInner(inner: string): boolean {
  if (inner.length === 0) return false;

  if (inner.startsWith("/")) {
    return isBareTagName(inner.slice(1));
  }

  const eq = inner.indexOf("=");
  if (eq === -1) {
    return isBareTagName(inner);
  }

  const name = inner.slice(0, eq);
  const value = inner.slice(eq + 1);
  if (!isBareTagName(name)) return false;
  if (value.length === 0) return false;
  return true;
}

function isBareTagName(s: string): boolean {
  if (s.length === 0) return false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k]!;
    if (!(
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9")
    )) {
      return false;
    }
  }
  return true;
}

function parseTag(inner: string, raw: string): RenpyToken | null {
  if (inner.startsWith("/")) {
    const name = inner.slice(1);
    if (CLOSEABLE_TAGS.has(name as RenpyTag)) {
      return { kind: "close", tag: name as RenpyTag, raw };
    }
    return null;
  }

  const eq = inner.indexOf("=");
  if (eq === -1) {
    const classified = classifyTagName(inner);
    if (classified === null) return null;
    if (SELF_TAGS.has(classified as RenpySelfTag)) {
      return { kind: "self", tag: classified as RenpySelfTag, raw };
    }
    return { kind: "open", tag: classified as RenpyTag, raw };
  }

  const name = inner.slice(0, eq);
  const value = inner.slice(eq + 1);
  if (CLOSEABLE_TAGS.has(name as RenpyTag)) {
    return { kind: "open", tag: name as RenpyTag, raw, value };
  }
  return null;
}

/**
 * Merge runs of adjacent `text` tokens into a single token. This is a
 * postprocessing pass for the common case of text surrounding an unknown
 * well-formed tag (e.g. `"Hi {whatever} there"`), where the loop naturally
 * emits three text tokens. Consumers should never see fragmented text spans.
 */
function coalesceAdjacentText(tokens: RenpyToken[]): RenpyToken[] {
  const out: RenpyToken[] = [];
  for (const t of tokens) {
    const last = out.at(-1);
    if (t.kind === "text" && last?.kind === "text") {
      last.value += t.value;
    } else {
      out.push(t);
    }
  }
  return out;
}
