/**
 * RenderedLine component tests
 *
 * Tests the presentational layer with formatting tags HIDDEN.
 * Only styled content, interpolation, and malformed markers are visible.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { tokenize } from "@/lib/renpy-tags";
import { RenderedLine } from "../RenderedLine";

function renderTokens(text: string) {
  const tokens = tokenize(text);
  return render(<RenderedLine tokens={tokens} />);
}

/** Get all <span> children of the rendered-line container. */
function getSpans(container: HTMLElement): HTMLSpanElement[] {
  const root = container.querySelector("[data-rendered-line]");
  return Array.from(root?.querySelectorAll(":scope > span") ?? []);
}

describe("RenderedLine", () => {
  describe("basic rendering", () => {
    it("renders empty div for empty tokens", () => {
      const { container } = render(<RenderedLine tokens={[]} />);
      const root = container.querySelector("[data-rendered-line]");
      expect(root).toBeInTheDocument();
      expect(root?.textContent).toBe("");
    });

    it("renders plain text", () => {
      const { container } = renderTokens("Hello, world.");
      expect(container.querySelector("[data-rendered-line]")?.textContent).toBe(
        "Hello, world."
      );
    });

    it("has whitespace-pre-wrap on container", () => {
      const { container } = renderTokens("hi");
      const root = container.querySelector("[data-rendered-line]");
      expect(root?.className).toMatch(/whitespace-pre-wrap/);
    });

    it("renders literal \\n escape as a visual line break", () => {
      const { container } = renderTokens("line1\\nline2");
      const root = container.querySelector("[data-rendered-line]");
      // Newline token renders as actual \n (not literal backslash-n)
      expect(root?.textContent).toBe("line1\nline2");
    });

    it("renders actual newlines in text", () => {
      const { container } = renderTokens("line1\nline2");
      expect(container.textContent).toBe("line1\nline2");
    });

    it("accepts custom className alongside whitespace-pre-wrap", () => {
      const { container } = render(
        <RenderedLine tokens={tokenize("hi")} className="custom-test" />
      );
      const root = container.querySelector("[data-rendered-line]");
      expect(root).toHaveClass("custom-test");
      expect(root).toHaveClass("whitespace-pre-wrap");
    });
  });

  describe("formatting tags are hidden", () => {
    it("{b}bold{/b} renders just 'bold' (no tag markers)", () => {
      const { container } = renderTokens("{b}bold{/b}");
      expect(container.textContent).toBe("bold");
    });

    it("{i}italic{/i} renders just 'italic'", () => {
      const { container } = renderTokens("{i}italic{/i}");
      expect(container.textContent).toBe("italic");
    });

    it("{color=#f00}red{/color} renders just 'red'", () => {
      const { container } = renderTokens("{color=#f00}red{/color}");
      expect(container.textContent).toBe("red");
    });

    it("self-closing {w} is hidden", () => {
      const { container } = renderTokens("wait{w}now");
      expect(container.textContent).toBe("waitnow");
    });

    it("{size=+5} tags are hidden but content shows", () => {
      const { container } = renderTokens("{size=+5}big{/size}");
      expect(container.textContent).toBe("big");
    });

    it("mixed tags and text: only text is visible", () => {
      const { container } = renderTokens(
        "Hello {b}world{/b} and {i}stuff{/i}!"
      );
      expect(container.textContent).toBe("Hello world and stuff!");
    });
  });

  describe("visual formatting applied to content", () => {
    it("{b} applies font-weight: bold", () => {
      const { container } = renderTokens("{b}bold{/b}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "bold");
      expect(content?.style.fontWeight).toBe("bold");
    });

    it("{i} applies font-style: italic", () => {
      const { container } = renderTokens("{i}italic{/i}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "italic");
      expect(content?.style.fontStyle).toBe("italic");
    });

    it("{u} applies underline", () => {
      const { container } = renderTokens("{u}under{/u}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "under");
      expect(content?.style.textDecorationLine).toContain("underline");
    });

    it("{s} applies line-through", () => {
      const { container } = renderTokens("{s}struck{/s}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "struck");
      expect(content?.style.textDecorationLine).toContain("line-through");
    });

    it("{color=#f00} applies color", () => {
      const { container } = renderTokens("{color=#f00}red{/color}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "red");
      expect(content?.style.color).toBeTruthy();
    });
  });

  describe("nested tags", () => {
    it("applies both styles to inner content", () => {
      const { container } = renderTokens("{i}{b}text{/b}{/i}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "text");
      expect(content?.style.fontWeight).toBe("bold");
      expect(content?.style.fontStyle).toBe("italic");
    });

    it("hides all tag markers in nested structure", () => {
      const { container } = renderTokens("{i}hello {b}world{/b}!{/i}");
      expect(container.textContent).toBe("hello world!");
    });
  });

  describe("u + s combined", () => {
    it("applies both underline and line-through", () => {
      const { container } = renderTokens("{u}{s}both{/s}{/u}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "both");
      expect(content?.style.textDecorationLine).toContain("underline");
      expect(content?.style.textDecorationLine).toContain("line-through");
    });
  });

  describe("interpolation (visible)", () => {
    it("renders [name] with muted foreground color", () => {
      const { container } = renderTokens("Hello [name]!");
      expect(container.textContent).toBe("Hello [name]!");
      const spans = getSpans(container);
      const interp = spans.find((s) => s.textContent === "[name]");
      // Uses the design-system --muted-foreground token so it reads as
      // a subdued reference (darker than body text) and adapts to the
      // active theme. Assert on the token name rather than a literal
      // value so the test doesn't break when the palette changes.
      expect(interp?.style.color).toContain("--muted-foreground");
    });

    it("interpolation inside formatting tags inherits style", () => {
      const { container } = renderTokens("{b}[var]{/b}");
      const spans = getSpans(container);
      const interp = spans.find((s) => s.textContent === "[var]");
      expect(interp?.style.fontWeight).toBe("bold");
    });
  });

  describe("malformed tags (visible)", () => {
    it("renders malformed {} using the destructive theme color", () => {
      const { container } = renderTokens("a{}b");
      expect(container.textContent).toBe("a{}b");
      const spans = getSpans(container);
      const malformed = spans.find((s) => s.textContent === "{}");
      // Uses the design-system --destructive token so the color adapts to
      // the active theme (light/dark). We assert on the token name rather
      // than a literal RGB so the test doesn't break when the palette
      // changes.
      expect(malformed?.style.color).toContain("--destructive");
    });
  });

  describe("size and alpha tags", () => {
    it("{size=+5} applies a relative font-size offset", () => {
      const { container } = renderTokens("{size=+5}big{/size}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "big");
      expect(content?.style.fontSize).toBe("calc(1em + 5px)");
    });

    it("{size=-2} applies a negative relative font-size offset", () => {
      const { container } = renderTokens("{size=-2}small{/size}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "small");
      expect(content?.style.fontSize).toBe("calc(1em - 2px)");
    });

    it("{size=24} applies an absolute pixel size", () => {
      const { container } = renderTokens("{size=24}abs{/size}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "abs");
      expect(content?.style.fontSize).toBe("24px");
    });

    it("{alpha=0.5} sets opacity to 0.5", () => {
      const { container } = renderTokens("{alpha=0.5}ghost{/alpha}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "ghost");
      expect(content?.style.opacity).toBe("0.5");
    });

    it("{alpha=2.0} clamps to opacity 1", () => {
      const { container } = renderTokens("{alpha=2.0}bright{/alpha}");
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "bright");
      expect(content?.style.opacity).toBe("1");
    });
  });

  describe("newline rendering", () => {
    it("\\n creates a visual line break", () => {
      const { container } = renderTokens("a\\nb");
      expect(container.textContent).toBe("a\nb");
    });

    it("\\n inside tags still breaks", () => {
      const { container } = renderTokens("{b}line1\\nline2{/b}");
      expect(container.textContent).toBe("line1\nline2");
    });

    it("multiple \\n create multiple breaks", () => {
      const { container } = renderTokens("a\\nb\\nc");
      expect(container.textContent).toBe("a\nb\nc");
    });
  });

  describe("edge cases", () => {
    it("renders content when open tag is never closed", () => {
      const { container } = renderTokens("{b}never closed");
      expect(container.textContent).toBe("never closed");
      // Content should still be bold
      const spans = getSpans(container);
      const content = spans.find((s) => s.textContent === "never closed");
      expect(content?.style.fontWeight).toBe("bold");
    });

    it("unmatched close is silently ignored", () => {
      const { container } = renderTokens("text {/b}");
      // Just the text is shown, close tag is hidden
      expect(container.textContent).toBe("text ");
    });

    it("handles the canonical issue #137 example", () => {
      const input =
        '"This is {b}very important{/b} and {color=#f00}red text{/color}."';
      const { container } = renderTokens(input);
      // Tags hidden, only text + quote marks visible
      expect(container.textContent).toBe(
        '"This is very important and red text."'
      );
      // Bold content styled
      const spans = getSpans(container);
      const boldContent = spans.find((s) => s.textContent === "very important");
      expect(boldContent?.style.fontWeight).toBe("bold");
    });

    it("handles mixed content: tags, interpolation, and self-closing", () => {
      const { container } = renderTokens("{b}[name]{/b}{w}!");
      // Tags and {w} hidden, interpolation and ! visible
      expect(container.textContent).toBe("[name]!");
    });
  });
});
