/**
 * Character Parser Service Tests
 *
 * Unit tests for the character definition parser, focused on name
 * classification and display-name derivation introduced in #138:
 * - `literal`   — `Character("Sarah", ...)`
 * - `variable`  — `Character(boss_name, ...)`
 * - `interpolated` — `Character("[e_name]", ...)` or `Character([e_name], ...)`
 * - `tagged`    — `Character("{color=#f00}Stranger{/color}", ...)`
 * - `none`      — `Character(None, ...)`
 * - `empty`     — `Character("", ...)`
 * - `unknown`   — `Character("???", ...)`
 */

import { describe, it, expect } from "vitest";
import { characterParserService } from "../character-parser.service.js";

describe("characterParserService", () => {
  describe("name classification", () => {
    it("classifies a plain quoted string as 'literal'", () => {
      const content = `define s = Character("Sarah", color="#c8ffc8")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const s = chars[0];
      expect(s.tag).toBe("s");
      expect(s.name).toBe("Sarah");
      expect(s.displayName).toBe("Sarah");
      expect(s.nameType).toBe("literal");
      expect(s.confidence).toBe(1.0);
    });

    it("classifies a bare Python identifier as 'variable'", () => {
      const content = `define boss = Character(boss_name, color="#ff0000")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const boss = chars[0];
      expect(boss.tag).toBe("boss");
      expect(boss.name).toBe("boss_name");
      expect(boss.displayName).toBe("boss_name");
      expect(boss.nameType).toBe("variable");
      expect(boss.confidence).toBe(0.5);
    });

    it("classifies a bracketed expression as 'interpolated'", () => {
      const content = `define e = Character("[e_name]", color="#cfb53b")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const e = chars[0];
      expect(e.tag).toBe("e");
      // `name` stores the raw string content as written in the source —
      // brackets preserved so the import wizard can show the interpolation
      // syntax to the user (and so export can round-trip back to RPY).
      expect(e.name).toBe("[e_name]");
      expect(e.displayName).toBe("[e_name]");
      expect(e.nameType).toBe("interpolated");
      expect(e.confidence).toBe(0.5);
    });

    it("classifies a bracketed argument form as 'interpolated'", () => {
      const content = `define ne = Character([persistent.pl_nickname], color="#cfb53b")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const ne = chars[0];
      expect(ne.tag).toBe("ne");
      // Round-trip fidelity: `name` preserves the brackets so an
      // export can re-emit the original `Character([...], ...)` form.
      expect(ne.name).toBe("[persistent.pl_nickname]");
      expect(ne.displayName).toBe("[persistent.pl_nickname]");
      expect(ne.nameType).toBe("interpolated");
      expect(ne.confidence).toBe(0.5);
    });

    it("classifies 'None' as 'none'", () => {
      const content = `define n = Character(None, what_color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const n = chars[0];
      expect(n.tag).toBe("n");
      expect(n.name).toBeNull();
      expect(n.displayName).toBe("");
      expect(n.nameType).toBe("none");
      expect(n.confidence).toBe(0.5);
    });

    it("classifies an empty string as 'empty'", () => {
      const content = `define e = Character("", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const e = chars[0];
      expect(e.tag).toBe("e");
      expect(e.name).toBe("");
      expect(e.displayName).toBe("");
      expect(e.nameType).toBe("empty");
      expect(e.confidence).toBe(1.0);
    });

    it("classifies '???' as 'unknown'", () => {
      const content = `define s = Character("???", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const s = chars[0];
      expect(s.tag).toBe("s");
      expect(s.name).toBe("???");
      expect(s.displayName).toBe("???");
      expect(s.nameType).toBe("unknown");
      expect(s.confidence).toBe(1.0);
    });
  });

  describe("Ren'Py text tag handling", () => {
    it("strips color tags from the display name", () => {
      const content = `define mystery = Character("{color=#f00}Stranger{/color}", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const mystery = chars[0];
      expect(mystery.name).toBe("{color=#f00}Stranger{/color}");
      expect(mystery.displayName).toBe("Stranger");
      expect(mystery.nameType).toBe("tagged");
    });

    it("strips nested and combined tags", () => {
      const content = `define boss = Character("{b}{color=#f00}Final Boss{/color}{/b}", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const boss = chars[0];
      expect(boss.displayName).toBe("Final Boss");
      expect(boss.nameType).toBe("tagged");
    });

    it("strips size and other parameterized tags", () => {
      const content = `define s = Character("{size=30}Big{/size}", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const s = chars[0];
      expect(s.displayName).toBe("Big");
      expect(s.nameType).toBe("tagged");
    });

    it("preserves the raw name verbatim for round-tripping", () => {
      const content = `define mystery = Character("{color=#f00}Stranger{/color}", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      // `name` keeps the original so export can re-emit the RPY
      expect(chars[0].name).toBe("{color=#f00}Stranger{/color}");
    });
  });

  describe("non-ASCII names", () => {
    it("preserves Japanese characters in literal names", () => {
      const content = `define e = Character("エイリーン", color="#cfb53b")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const e = chars[0];
      expect(e.name).toBe("エイリーン");
      expect(e.displayName).toBe("エイリーン");
      expect(e.nameType).toBe("literal");
    });

    it("preserves mixed CJK + Latin characters", () => {
      const content = `define s = Character("桜 — Sakura", color="#cfb53b")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      expect(chars[0].displayName).toBe("桜 — Sakura");
      expect(chars[0].nameType).toBe("literal");
    });

    it("preserves emoji", () => {
      const content = `define s = Character("Sarah \u{1F600}", color="#cfb53b")`;
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      expect(chars[0].displayName).toBe("Sarah \u{1F600}");
      expect(chars[0].nameType).toBe("literal");
    });
  });

  describe("multi-line definitions", () => {
    it("classifies a multi-line definition with a bracketed name as 'interpolated'", () => {
      const content = [
        "define e = Character(",
        '    "[e_name]",',
        '    color="#cfb53b"',
        ")",
      ].join("\n");
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      const e = chars[0];
      expect(e.tag).toBe("e");
      // Raw string content (with brackets) preserved.
      expect(e.name).toBe("[e_name]");
      expect(e.displayName).toBe("[e_name]");
      expect(e.nameType).toBe("interpolated");
    });

    it("classifies a multi-line definition with a bare identifier as 'variable'", () => {
      const content = [
        "define boss = Character(",
        "    boss_name,",
        '    color="#ff0000"',
        ")",
      ].join("\n");
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      expect(chars[0].nameType).toBe("variable");
      expect(chars[0].displayName).toBe("boss_name");
    });

    it("classifies a multi-line definition with a tagged name as 'tagged'", () => {
      const content = [
        "define mystery = Character(",
        '    "{color=#f00}Stranger{/color}",',
        '    color="#cfcfcf"',
        ")",
      ].join("\n");
      const chars = characterParserService.parseFile(content, "test.rpy");

      expect(chars).toHaveLength(1);
      expect(chars[0].nameType).toBe("tagged");
      expect(chars[0].displayName).toBe("Stranger");
      expect(chars[0].name).toBe("{color=#f00}Stranger{/color}");
    });
  });

  describe("color extraction (regression)", () => {
    it("extracts color from single-line definitions", () => {
      const content = `define s = Character("Sarah", color="#c8ffc8")`;
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars[0].color).toBe("#c8ffc8");
    });

    it("prefers who_color over color", () => {
      const content = `define s = Character("Sarah", who_color="#c8ffc8", color="#000000")`;
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars[0].color).toBe("#c8ffc8");
    });

    it("falls back to default color when none specified", () => {
      const content = `define s = Character("Sarah")`;
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars[0].color).toBe("#cfcfcf");
    });
  });

  describe("isSpecial flag (regression)", () => {
    it("marks narrator (n) as special", () => {
      const content = `define n = Character(None, what_color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars[0].isSpecial).toBe(true);
    });

    it("does not let a subsequent color line overwrite a multi-line None name", () => {
      // Regression: a multi-line `None` followed by a quoted `color=`
      // option used to capture `"#cfcfcf"` as the narrator's name
      // because the guard was `!pendingCharacter.name` (which is
      // `true` when name is `null`). A `nameResolved` flag now locks
      // the name once it's been set to `null`.
      const content = [
        "define n = Character(",
        "    None,",
        '    color="#cfcfcf"',
        ")",
      ].join("\n");
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars).toHaveLength(1);
      expect(chars[0].name).toBeNull();
      expect(chars[0].displayName).toBe("");
      expect(chars[0].nameType).toBe("none");
      expect(chars[0].color).toBe("#cfcfcf");
    });

    it("marks unknown speaker (u) as special", () => {
      const content = `define u = Character("???", color="#cfcfcf")`;
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars[0].isSpecial).toBe(true);
    });

    it("does not mark normal characters as special", () => {
      const content = `define s = Character("Sarah", color="#c8ffc8")`;
      const chars = characterParserService.parseFile(content, "test.rpy");
      expect(chars[0].isSpecial).toBe(false);
    });
  });

  describe("deduplication (regression)", () => {
    it("keeps first occurrence when same tag appears in multiple files", () => {
      const result = characterParserService.parseFiles([
        { content: `define s = Character("Sarah")`, filename: "a.rpy" },
        { content: `define s = Character("S")`, filename: "b.rpy" },
      ]);

      expect(result.characters).toHaveLength(1);
      expect(result.characters[0].displayName).toBe("Sarah");
    });
  });
});
