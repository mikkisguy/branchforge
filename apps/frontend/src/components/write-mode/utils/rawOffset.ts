/**
 * Given pixel coordinates (e.g. from a mouse click on the rendered overlay),
 * find the equivalent character offset in the RAW textarea text.
 *
 * Uses `caretRangeFromPoint` / `caretPositionFromPoint` to locate the text
 * node under the cursor, then reads `data-raw-start` and `data-raw-len` from
 * the enclosing rendered span to map back to raw-text coordinates.
 *
 * Returns `null` if the position can't be determined (e.g. clicked on empty
 * space, or the API is unavailable). Caller should fall back to default focus.
 */
export function getRawOffsetFromPoint(x: number, y: number): number | null {
  let container: Node | null = null;
  let offset = 0;

  // Firefox: caretPositionFromPoint (standard)
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      container = pos.offsetNode;
      offset = pos.offset;
    }
  }

  // Chrome / Safari / Edge: caretRangeFromPoint (de-facto standard)
  if (
    container === null &&
    typeof document.caretRangeFromPoint === "function"
  ) {
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
      container = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (container === null) return null;

  // When the click lands on padding or an element node (rather than a text
  // node), `startOffset` is a *child index*, not a character offset. There's
  // no reliable way to map that back to a raw-text caret position, so bail
  // out and let the caller fall back to default focus.
  if (container.nodeType !== Node.TEXT_NODE) return null;

  // Walk up to the nearest rendered span with position metadata.
  const element = container.parentElement;
  const span = element?.closest("[data-raw-start]");
  if (!span) return null;

  const rawStart = parseInt(span.getAttribute("data-raw-start") || "0", 10);
  const rawLen = parseInt(span.getAttribute("data-raw-len") || "0", 10);
  const renderedLen = span.textContent?.length ?? 0;

  if (renderedLen === 0 || rawLen === renderedLen) {
    // Normal tokens (text, interpolation, malformed): 1:1 mapping.
    return rawStart + offset;
  }

  // Newline tokens: raw is 2 chars ("\n"), rendered is 1 char.
  // Scale proportionally and clamp to [rawStart, rawStart + rawLen].
  const scaled = Math.round((offset / renderedLen) * rawLen);
  return rawStart + Math.min(scaled, rawLen);
}
