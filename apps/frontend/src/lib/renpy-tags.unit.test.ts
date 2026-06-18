import { describe, it, expect } from "vitest";
import { tokenize, stringify, type RenpyToken } from "@/lib/renpy-tags";

/** Convenience: tokenize + stringify and assert round-trip equality. */
function expectRoundTrip(input: string): void {
  const tokens = tokenize(input);
  expect(stringify(tokens)).toBe(input);
}

describe("renpy-tags tokenize", () => {
  describe("plain text", () => {
    it("returns no tokens for empty input", () => {
      expect(tokenize("")).toEqual([]);
    });

    it("returns a single text token for input without tags", () => {
      expect(tokenize("Hello, world.")).toEqual([
        { kind: "text", value: "Hello, world." },
      ]);
    });

    it("preserves whitespace and punctuation", () => {
      expect(tokenize("  Hi!  Bye.  ")).toEqual([
        { kind: "text", value: "  Hi!  Bye.  " },
      ]);
    });
  });

  describe("closeable tags (b / i / u / s)", () => {
    it.each(["b", "i", "u", "s"] as const)("handles {%s}...{/%s}", (tag) => {
      const input = `This is {${tag}}styled{/${tag}} text.`;
      expect(tokenize(input)).toEqual([
        { kind: "text", value: "This is " },
        { kind: "open", tag, raw: `{${tag}}` },
        { kind: "text", value: "styled" },
        { kind: "close", tag, raw: `{/${tag}}` },
        { kind: "text", value: " text." },
      ]);
    });

    it("handles adjacent same-tag spans", () => {
      const input = "{b}a{/b}{b}b{/b}";
      expect(tokenize(input)).toEqual([
        { kind: "open", tag: "b", raw: "{b}" },
        { kind: "text", value: "a" },
        { kind: "close", tag: "b", raw: "{/b}" },
        { kind: "open", tag: "b", raw: "{b}" },
        { kind: "text", value: "b" },
        { kind: "close", tag: "b", raw: "{/b}" },
      ]);
    });
  });

  describe("parameterized closeable tags", () => {
    it("handles {color=#f00}", () => {
      const input = "{color=#f00}red{/color}";
      expect(tokenize(input)).toEqual([
        { kind: "open", tag: "color", raw: "{color=#f00}", value: "#f00" },
        { kind: "text", value: "red" },
        { kind: "close", tag: "color", raw: "{/color}" },
      ]);
    });

    it("handles {size=+5} with signed value", () => {
      const input = "{size=+5}big{/size}";
      const tokens = tokenize(input);
      expect(tokens[0]).toEqual({
        kind: "open",
        tag: "size",
        raw: "{size=+5}",
        value: "+5",
      });
      expectRoundTrip(input);
    });

    it("handles {font=arial.ttf} with dots in value", () => {
      const input = "{font=arial.ttf}hi{/font}";
      const tokens = tokenize(input);
      expect(tokens[0]).toEqual({
        kind: "open",
        tag: "font",
        raw: "{font=arial.ttf}",
        value: "arial.ttf",
      });
      expectRoundTrip(input);
    });

    it("handles {alpha=0.5}", () => {
      const input = "{alpha=0.5}ghost{/alpha}";
      const tokens = tokenize(input);
      expect(tokens[0]).toEqual({
        kind: "open",
        tag: "alpha",
        raw: "{alpha=0.5}",
        value: "0.5",
      });
      expectRoundTrip(input);
    });

    it("handles {cps=20}", () => {
      const input = "{cps=20}slow{/cps}";
      const tokens = tokenize(input);
      expect(tokens[0]).toEqual({
        kind: "open",
        tag: "cps",
        raw: "{cps=20}",
        value: "20",
      });
      expectRoundTrip(input);
    });
  });

  describe("self-closing tags (w / p / nw / fast / clear / done)", () => {
    it.each(["w", "p", "nw", "fast", "clear", "done"] as const)(
      "handles {%s}",
      (tag) => {
        const input = `Before {${tag}} after`;
        expect(tokenize(input)).toEqual([
          { kind: "text", value: "Before " },
          { kind: "self", tag, raw: `{${tag}}` },
          { kind: "text", value: " after" },
        ]);
      }
    );

    it("does not treat {w} as a closeable tag", () => {
      // {w} is self-closing. A literal `{/w}` is well-formed shape but
      // `w` isn't a known closeable tag, so it round-trips as text rather
      // than a `close` token. The tokenizer coalesces adjacent text runs.
      const input = "{w}pause{/w}";
      const tokens = tokenize(input);
      expect(tokens[0]).toEqual({ kind: "self", tag: "w", raw: "{w}" });
      expect(tokens).toEqual([
        { kind: "self", tag: "w", raw: "{w}" },
        { kind: "text", value: "pause{/w}" },
      ]);
    });
  });

  describe("escape sequences", () => {
    it("tokenizes \\n as a newline token", () => {
      const tokens = tokenize("line1\\nline2");
      expect(tokens).toEqual([
        { kind: "text", value: "line1" },
        { kind: "newline", raw: "\\n" },
        { kind: "text", value: "line2" },
      ]);
    });

    it("tokenizes \\t as a newline token (tab)", () => {
      const tokens = tokenize("a\\tb");
      expect(tokens).toEqual([
        { kind: "text", value: "a" },
        { kind: "newline", raw: "\\t" },
        { kind: "text", value: "b" },
      ]);
    });

    it("handles \\n inside tags", () => {
      const input = "{b}bold\\nline2{/b}";
      expectRoundTrip(input);
      const tokens = tokenize(input);
      expect(tokens[2]).toEqual({ kind: "newline", raw: "\\n" });
    });

    it("does not treat lone backslash as escape", () => {
      expect(tokenize("a\\b")).toEqual([{ kind: "text", value: "a\\b" }]);
    });

    it("does not treat \\x (unknown escape) as escape", () => {
      expect(tokenize("a\\xb")).toEqual([{ kind: "text", value: "a\\xb" }]);
    });

    it("round-trips \\n correctly", () => {
      expectRoundTrip("line1\\nline2\\nline3");
    });
  });

  describe("nested tags", () => {
    it("handles bold-inside-italic", () => {
      const input = "{i}hello {b}world{/b}!{/i}";
      const tokens = tokenize(input);
      expect(tokens).toEqual([
        { kind: "open", tag: "i", raw: "{i}" },
        { kind: "text", value: "hello " },
        { kind: "open", tag: "b", raw: "{b}" },
        { kind: "text", value: "world" },
        { kind: "close", tag: "b", raw: "{/b}" },
        { kind: "text", value: "!" },
        { kind: "close", tag: "i", raw: "{/i}" },
      ]);
    });

    it("handles color-inside-italic", () => {
      const input = "{i}{color=#f00}red{/color} normal{/i}";
      expectRoundTrip(input);
    });
  });

  describe("variable interpolation", () => {
    it("tokenizes [name] as an interpolation", () => {
      const input = "Hello [player_name]!";
      expect(tokenize(input)).toEqual([
        { kind: "text", value: "Hello " },
        { kind: "interpolation", name: "player_name", raw: "[player_name]" },
        { kind: "text", value: "!" },
      ]);
    });

    it("handles dotted interpolation names", () => {
      const input = "Score: [player.score]";
      expect(tokenize(input)).toEqual([
        { kind: "text", value: "Score: " },
        { kind: "interpolation", name: "player.score", raw: "[player.score]" },
      ]);
    });

    it("treats a leading-digit interpolation as literal text", () => {
      // [1bad] — first char is a digit, so per Python identifier rules this
      // isn't a valid name. Fall back to literal '['.
      const tokens = tokenize("a[1bad]b");
      expect(tokens).toEqual([{ kind: "text", value: "a[1bad]b" }]);
    });

    it("treats empty [] as literal text", () => {
      expect(tokenize("a[]b")).toEqual([{ kind: "text", value: "a[]b" }]);
    });

    it("interpolation can sit between tags", () => {
      const input = "{b}[name]{/b}";
      expect(tokenize(input)).toEqual([
        { kind: "open", tag: "b", raw: "{b}" },
        { kind: "interpolation", name: "name", raw: "[name]" },
        { kind: "close", tag: "b", raw: "{/b}" },
      ]);
    });
  });

  describe("unknown and malformed tags", () => {
    it("treats unknown tag as text (preserves raw characters)", () => {
      // {whatever} is not in our known set — emit as a single text token so
      // the user sees the literal `{whatever}` in the prose editor.
      const input = "Hi {whatever} there";
      expect(tokenize(input)).toEqual([
        { kind: "text", value: "Hi {whatever} there" },
      ]);
    });

    it("treats unknown close as text (preserves raw characters)", () => {
      // `{/nope}` is well-formed shape (`/name`), but `nope` isn't a
      // recognized closeable tag. Round-trip as text rather than malformed
      // so the user sees the literal characters.
      const input = "a{/nope}b";
      expect(tokenize(input)).toEqual([{ kind: "text", value: "a{/nope}b" }]);
    });

    it("treats {b} (no name) as malformed", () => {
      const tokens = tokenize("a{}b");
      expect(tokens).toEqual([
        { kind: "text", value: "a" },
        { kind: "malformed", raw: "{}" },
        { kind: "text", value: "b" },
      ]);
    });

    it("treats {b=} (empty value) as malformed", () => {
      const tokens = tokenize("a{b=}b");
      expect(tokens).toEqual([
        { kind: "text", value: "a" },
        { kind: "malformed", raw: "{b=}" },
        { kind: "text", value: "b" },
      ]);
    });

    it("treats unterminated { as literal text", () => {
      // No closing brace — tokenizer should not loop forever, and the
      // remainder is treated as literal.
      const tokens = tokenize("hello {b world");
      expect(tokens).toEqual([{ kind: "text", value: "hello {b world" }]);
    });

    it("treats { on its own as literal text", () => {
      expect(tokenize("a{b")).toEqual([{ kind: "text", value: "a{b" }]);
    });

    it("treats nested { inside a tag as malformed (no close found)", () => {
      // {{b} — the inner `{` aborts the tag search, so the outer `{` is
      // unterminated and the whole thing is text.
      const tokens = tokenize("a{{b} rest");
      expect(tokens).toEqual([{ kind: "text", value: "a{{b} rest" }]);
    });

    it("does not crash on newline inside a tag (treats as unterminated)", () => {
      const tokens = tokenize("a{b\n}c");
      expect(tokens[0]).toEqual({ kind: "text", value: "a{b\n}c" });
    });
  });

  describe("round-trip (lossless)", () => {
    it.each([
      "Hello, world.",
      "This is {b}bold{/b} and {i}fancy{/i}.",
      "{color=#f00}Red{/color} and {color=#0f0}green{/color}.",
      "{size=+5}Big{/size} or {size=-2}small{/size}.",
      "{font=arial.ttf}Fancy{/font}.",
      "Wait{w}then continue{nw}now.",
      "Hello [player_name]!",
      "{b}[name] is {color=#f00}red{/color}{w}!{/b}",
    ])("round-trips %j", (input) => {
      expectRoundTrip(input);
    });
  });

  describe("the issue's example", () => {
    it("tokenizes the canonical example from the design issue", () => {
      const input =
        '"This is {b}very important{/b} and {color=#f00}red text{/color}."';
      const tokens = tokenize(input);
      const kinds = tokens.map((t) => t.kind);
      expect(kinds).toEqual([
        "text",
        "open",
        "text",
        "close",
        "text",
        "open",
        "text",
        "close",
        "text",
      ]);
      expectRoundTrip(input);
    });
  });

  describe("return type", () => {
    it("RenpyToken is a discriminated union (compile-time check via assignment)", () => {
      const tokens: RenpyToken[] = tokenize("{b}x{/b}");
      // If this compiles, the discriminated union is intact.
      const _exhaustive: RenpyToken = tokens[0]!;
      expect(_exhaustive).toBeDefined();
    });
  });
});
