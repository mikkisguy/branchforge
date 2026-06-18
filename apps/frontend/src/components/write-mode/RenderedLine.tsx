/**
 * RenderedLine Component
 *
 * Pure presentational component that renders a Ren'Py dialogue line with
 * visual formatting. Formatting tags ({b}, {i}, {color=...}, etc.) are
 * hidden — only the styled content is shown. This gives a clean reading
 * experience at the cost of a minor layout shift when switching to the
 * raw textarea on focus.
 *
 * What's visible in the rendered output:
 * - Text content with formatting applied (bold, italic, color, etc.)
 * - Variable interpolation [name] — shown in the theme's variable color
 *   (it's content, not formatting)
 * - Malformed tags — shown in the theme's destructive color (errors the
 *   writer needs to see)
 *
 * What's hidden:
 * - Open/close tags: {b}, {/b}, {color=#f00}, {/color}, etc.
 * - Self-closing tags: {w}, {p}, {nw}, etc.
 * - Newline escapes: \n (rendered as actual line break via whitespace-pre-wrap)
 *
 * **Coupling note:** Each rendered span carries `data-raw-start` and
 * `data-raw-len` attributes so `DialogueLine.getRawOffsetFromPoint` can map
 * a click on the rendered overlay to a caret position in the raw textarea.
 * This is a deliberate inter-component contract — keep the attribute names
 * and semantics in sync if either side changes.
 */

import React from "react";
import type { RenpyToken, RenpyTag } from "@/lib/renpy-tags";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderedLineProps {
  /** Token stream from `tokenize()`. */
  tokens: RenpyToken[];
  /** Optional CSS class for the outermost container. */
  className?: string;
}

/**
 * Render a Ren'Py token stream as formatted text with tags hidden.
 *
 * @example
 *   <RenderedLine tokens={tokenize('{b}Hello{/b} world')} />
 *   // Renders: <b>Hello</b> world  (bold styled, no visible {b} tags)
 */
export function RenderedLine({ tokens, className }: RenderedLineProps) {
  const nodes = renderTokens(tokens);
  return (
    <div
      className={`whitespace-pre-wrap ${className ?? ""}`}
      data-rendered-line="true"
    >
      {nodes}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface ActiveTag {
  tag: RenpyTag;
  value?: string;
}

/**
 * Single-pass flat rendering. Formatting tags are consumed silently (only
 * their style effect is applied to subsequent text). Non-formatting tokens
 * (interpolation, malformed, newline) are rendered visibly.
 *
 * Each rendered span carries `data-raw-start` and `data-raw-len` attributes
 * recording where the span's text sits in the original raw string. This
 * enables click-position mapping: when the user clicks on the rendered
 * overlay, we can find the exact character offset in the raw textarea text
 * (which includes hidden tags), so the caret lands in the right place.
 *
 * Span keys are derived from the raw-text position so unchanged spans keep
 * their DOM nodes across re-renders, reducing flicker on keystroke.
 */
function renderTokens(tokens: RenpyToken[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const stack: ActiveTag[] = [];
  let rawStart = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const rawLen = t.kind === "text" ? t.value.length : t.raw.length;
    // Stable across re-renders: a token's raw position + kind is unique
    // within a single tokenization. When the user types, the regenerated
    // tokens only shift suffixes, so prefix spans keep their identity.
    const key = `${rawStart}-${t.kind}`;

    switch (t.kind) {
      case "text":
        nodes.push(
          <span
            key={key}
            style={computeStyle(stack)}
            data-raw-start={rawStart}
            data-raw-len={rawLen}
          >
            {t.value}
          </span>
        );
        break;

      case "open":
        // Hidden — just push the style onto the stack.
        stack.push({ tag: t.tag, value: t.value });
        break;

      case "close":
        // Hidden — pop the style from the stack.
        popMatchingTag(stack, t.tag);
        break;

      case "self":
        // Hidden — self-closing tags have no visible content.
        break;

      case "newline":
        // Render as actual whitespace — whitespace-pre-wrap displays it.
        // Wrapped in a span for position mapping. Note: raw is 2 chars
        // (e.g. "\n") but rendered as 1 char (actual newline).
        nodes.push(
          <span key={key} data-raw-start={rawStart} data-raw-len={rawLen}>
            {t.raw === "\\t" ? "\t" : "\n"}
          </span>
        );
        break;

      case "interpolation":
        // Visible — variable references are content, not formatting.
        // Uses the theme's --muted-foreground color (darker than the body
        // text) so it reads as a subdued reference rather than syntax noise.
        nodes.push(
          <span
            key={key}
            style={{
              ...computeStyle(stack),
              color: "hsl(var(--muted-foreground))",
            }}
            title={`Variable: ${t.name}`}
            data-raw-start={rawStart}
            data-raw-len={rawLen}
          >
            {t.raw}
          </span>
        );
        break;

      case "malformed":
        // Visible — errors need attention. Uses the theme's `--destructive`
        // so it respects light/dark themes.
        nodes.push(
          <span
            key={key}
            style={{ color: "hsl(var(--destructive))" }}
            title={`Malformed: ${t.raw}`}
            data-raw-start={rawStart}
            data-raw-len={rawLen}
          >
            {t.raw}
          </span>
        );
        break;
    }

    rawStart += rawLen;
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Style computation
// ---------------------------------------------------------------------------

function computeStyle(stack: ActiveTag[]): React.CSSProperties {
  const style: React.CSSProperties = {};
  const decorations: string[] = [];

  for (const { tag, value } of stack) {
    switch (tag) {
      case "b":
        style.fontWeight = "bold";
        break;
      case "i":
        style.fontStyle = "italic";
        break;
      case "u":
        decorations.push("underline");
        break;
      case "s":
        decorations.push("line-through");
        break;
      case "color":
        if (value) style.color = value;
        break;
      case "size": {
        const fontSize = sizeToFontSize(value);
        if (fontSize) style.fontSize = fontSize;
        break;
      }
      case "alpha": {
        const opacity = alphaToOpacity(value);
        if (opacity !== null) style.opacity = opacity;
        break;
      }
      // `font` references a font file (e.g. "arial.ttf") we can't load in the
      // browser without a font-face declaration, so we leave it as a no-op
      // for now. `cps` and the self-closing timing tags (`w`/`p`/`nw`/`fast`/
      // `clear`/`done`) have no static visual equivalent in Ren'Py and are
      // also intentionally ignored.
    }
  }

  if (decorations.length > 0) {
    style.textDecorationLine = decorations.join(" ");
  }

  return style;
}

/**
 * Convert a Ren'Py size value to a CSS `font-size`.
 *
 * Ren'Py sizes are pixels: `+5`/`-2` are relative to the inherited size,
 * `24` is absolute. We translate that to a CSS `calc()` so the inherited
 * font size still drives the base.
 */
function sizeToFontSize(value: string | undefined): string | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  if (value.startsWith("+") || value.startsWith("-")) {
    const abs = Math.abs(n);
    const op = n >= 0 ? "+" : "-";
    return `calc(1em ${op} ${abs}px)`;
  }
  return `${n}px`;
}

/**
 * Convert a Ren'Py alpha value (0.0..1.0) to a CSS opacity.
 */
function alphaToOpacity(value: string | undefined): number | null {
  if (!value) return null;
  const a = parseFloat(value);
  if (Number.isNaN(a)) return null;
  return Math.max(0, Math.min(1, a));
}

function popMatchingTag(stack: ActiveTag[], tag: RenpyTag): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.tag === tag) {
      stack.splice(i, 1);
      return;
    }
  }
}
