/**
 * RPY Statements Utility Unit Tests
 *
 * Covers `computeCommonDirectoryPrefix` and `extractAndStripRpySymbols`.
 * The latter is the core helper that the import path uses to keep the
 * BranchForge database in sync with the symbols in the source RPY
 * files and to remove them from the stored file content. See
 * issue #244.
 */

import { describe, it, expect } from "vitest";
import {
  BRANCHFORGE_MANAGED_NOTICE,
  computeCommonDirectoryPrefix,
  extractAndStripRpySymbols,
} from "../rpy-statements.service.js";

const CHARACTER_NOTICE =
  "# [BranchForge] Managed character definitions were moved out of this file (exported as branchforge_definitions.rpy).";
const VARIABLE_NOTICE =
  "# [BranchForge] Managed boolean variable defaults were moved out of this file (exported as branchforge_variables.rpy).";
const STAT_NOTICE =
  "# [BranchForge] Managed numeric stat defaults were moved out of this file (exported as branchforge_stats.rpy).";

describe("rpy-statements.service", () => {
  // ---------------------------------------------------------------------
  // computeCommonDirectoryPrefix
  // ---------------------------------------------------------------------

  describe("computeCommonDirectoryPrefix", () => {
    it("returns shared top-level directory for files in same parent with different subdirectories", () => {
      expect(
        computeCommonDirectoryPrefix([
          "game/ch1/script.rpy",
          "game/ch2/scene.rpy",
          "game/ui/menu.rpy",
        ])
      ).toBe("game/");
    });

    it("returns top-level directory for deeply nested files sharing it", () => {
      expect(
        computeCommonDirectoryPrefix([
          "game/deep/nested/script.rpy",
          "game/ch2/scene.rpy",
        ])
      ).toBe("game/");
    });

    it("returns empty string when files have different top-level directories", () => {
      expect(
        computeCommonDirectoryPrefix([
          "src/app.ts",
          "tests/app.test.ts",
          "docs/readme.md",
        ])
      ).toBe("");
    });

    it("returns empty string when no files have a directory component", () => {
      expect(
        computeCommonDirectoryPrefix(["README.md", "LICENSE", "CHANGELOG.md"])
      ).toBe("");
    });

    it("returns empty string for empty input", () => {
      expect(computeCommonDirectoryPrefix([])).toBe("");
    });

    it("returns top-level dir even when some files are root-level", () => {
      expect(
        computeCommonDirectoryPrefix([
          "game/script.rpy",
          "game/data.rpy",
          "README.md",
        ])
      ).toBe("game/");
    });

    it("handles deeply nested single file", () => {
      expect(
        computeCommonDirectoryPrefix(["deeply/nested/path/file.rpy"])
      ).toBe("deeply/");
    });

    it("only considers first segment, not full common ancestry", () => {
      expect(
        computeCommonDirectoryPrefix([
          "a/b/c/d/e/file1.rpy",
          "a/b/c/d/f/file2.rpy",
        ])
      ).toBe("a/");
    });
  });

  // ---------------------------------------------------------------------
  // extractAndStripRpySymbols
  // ---------------------------------------------------------------------

  describe("extractAndStripRpySymbols", () => {
    it("returns empty arrays and unchanged content for empty input", () => {
      const result = extractAndStripRpySymbols("");
      expect(result.cleanedContent).toBe("");
      expect(result.characters).toMatchObject([]);
      expect(result.variables).toEqual([]);
      expect(result.stats).toEqual([]);
    });

    it("preserves content that contains no define/default statements", () => {
      const content = [
        "# My script",
        "label start:",
        '    "Hello, world."',
        "    return",
        "",
        "label next:",
        '    "Goodbye."',
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.cleanedContent).toBe(content);
      expect(result.characters).toMatchObject([]);
      expect(result.variables).toEqual([]);
      expect(result.stats).toEqual([]);
    });

    it("strips a single-line character definition and captures the character", () => {
      const content = [
        'define e = Character("Eileen", color="#c8ffc8")',
        "",
        "label start:",
        '    e "Hello."',
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        { tag: "e", name: "Eileen", color: "#c8ffc8" },
      ]);
      expect(result.cleanedContent).not.toContain("define e = Character");
      expect(result.cleanedContent.split("\n")[0]).toBe(CHARACTER_NOTICE);
      expect(result.cleanedContent.split("\n")[1]).toBe("");
      expect(result.cleanedContent).toContain("label start:");
      expect(result.cleanedContent).toContain('e "Hello."');
    });

    it("strips a multi-line character definition and captures the character", () => {
      const content = [
        "define e = Character(",
        '    "Eileen",',
        '    color="#c8ffc8",',
        '    who_color="#c8c8c8"',
        ")",
        "",
        "label start:",
        '    e "Hello."',
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        // who_color wins over color when both are present
        { tag: "e", name: "Eileen", color: "#c8c8c8" },
      ]);
      // The multi-line definition is fully removed from cleaned content.
      expect(result.cleanedContent).not.toContain("define e = Character");
      expect(result.cleanedContent).not.toContain('"Eileen",');
      expect(result.cleanedContent).not.toContain("who_color=");
      expect(result.cleanedContent.split("\n")[0]).toBe(CHARACTER_NOTICE);
      expect(result.cleanedContent.split("\n")[1]).toBe("");
      expect(result.cleanedContent).toContain("label start:");
    });

    it("strips multiple character definitions and preserves order", () => {
      const content = [
        'define e = Character("Eileen", color="#c8ffc8")',
        'define s = Character("Sylvie", color="#ff0000")',
        'define l = Character("Lucy", color="#0000ff")',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        { tag: "e", name: "Eileen", color: "#c8ffc8" },
        { tag: "s", name: "Sylvie", color: "#ff0000" },
        { tag: "l", name: "Lucy", color: "#0000ff" },
      ]);
      expect(result.cleanedContent).not.toMatch(/^define\s/m);
    });

    it("handles a space between Character and the opening parenthesis", () => {
      // Ren'Py accepts `Character (` (with a space) just as readily
      // as `Character(`. The regex permits both via `\s*`; the body
      // extraction must match the same whitespace tolerance, or
      // such lines would be silently dropped because the body
      // slice starts at `indexOf("Character(")`.
      const content = [
        'define e = Character ("Eileen", color="#c8ffc8")',
        "",
        "label start:",
        '    e "Hello."',
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        { tag: "e", name: "Eileen", color: "#c8ffc8" },
      ]);
      expect(result.cleanedContent).not.toContain("define e = Character");
      expect(result.cleanedContent).toContain("label start:");

      // Same expectation for the multi-line form: whitespace between
      // `Character` and `(` is allowed.
      const multiLine = [
        "define s = Character (",
        '    "Sylvie",',
        '    color="#ff0000"',
        ")",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const multi = extractAndStripRpySymbols(multiLine);
      expect(multi.characters).toMatchObject([
        { tag: "s", name: "Sylvie", color: "#ff0000" },
      ]);
      expect(multi.cleanedContent).not.toContain("define s = Character");
    });

    it("classifies default True/False as variables", () => {
      const content = [
        "default met_alex = False",
        "default has_key = True",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.variables).toEqual([
        { key: "met_alex", value: "False", kind: "variable" },
        { key: "has_key", value: "True", kind: "variable" },
      ]);
      expect(result.stats).toEqual([]);
      expect(result.cleanedContent).not.toContain("default met_alex");
      expect(result.cleanedContent).not.toContain("default has_key");
      expect(result.cleanedContent.split("\n")[0]).toBe(VARIABLE_NOTICE);
      expect(result.cleanedContent.split("\n")[1]).toBe("");
    });

    it("classifies numeric default as stats", () => {
      const content = [
        "default affection = 0",
        "default trust = 50",
        "default max_value = 100",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.stats).toEqual([
        { key: "affection", value: "0", kind: "stat" },
        { key: "trust", value: "50", kind: "stat" },
        { key: "max_value", value: "100", kind: "stat" },
      ]);
      expect(result.variables).toEqual([]);
      expect(result.cleanedContent).not.toContain("default affection");
      expect(result.cleanedContent.split("\n")[0]).toBe(STAT_NOTICE);
      expect(result.cleanedContent.split("\n")[1]).toBe("");
      expect(result.cleanedContent).not.toContain("default trust");
      expect(result.cleanedContent).not.toContain("default max_value");
    });

    it("preserves default statements with unknown values rather than stripping them", () => {
      // Quoted strings, identifier references and other non-boolean,
      // non-numeric RHS values have no place in the variables/stats
      // tables. Stripping them silently would lose user-authored
      // state, so the extractor leaves them in the cleaned content
      // and simply does not classify them. The downstream import
      // path also does not touch them.
      const content = [
        'default mood = "happy"',
        "default score = max_score",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.variables).toEqual([]);
      expect(result.stats).toEqual([]);
      expect(result.cleanedContent).toContain('default mood = "happy"');
      expect(result.cleanedContent).toContain("default score = max_score");
    });

    it("recognises default <tag> = Character(...) as a character definition", () => {
      // Both `define` and `default` are valid Ren'Py keywords for
      // declaring a character; the import path must treat them
      // identically so neither is silently dropped.
      const content = [
        'default e = Character("Eileen", color="#c8ffc8")',
        "",
        "label start:",
        '    e "Hello."',
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        { tag: "e", name: "Eileen", color: "#c8ffc8" },
      ]);
      expect(result.cleanedContent).not.toContain("default e = Character");
      expect(result.cleanedContent).toContain("label start:");
    });

    it("strips comments after default values and still captures the value", () => {
      const content = [
        "default met_alex = False  # a flag",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.variables).toEqual([
        { key: "met_alex", value: "False", kind: "variable" },
      ]);
      expect(result.cleanedContent).not.toContain("default met_alex");
    });

    it("preserves leading comments and blank lines around stripped statements", () => {
      const content = [
        "# header comment",
        "",
        'define e = Character("Eileen", color="#c8ffc8")',
        "",
        "# body comment",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.cleanedContent).toBe(
        [
          CHARACTER_NOTICE,
          "",
          "# header comment",
          "",
          "",
          "# body comment",
          "label start:",
          "    return",
        ].join("\n")
      );
    });

    it("preserves indented characters while retaining default handling", () => {
      const content = [
        '  define e = Character("Eileen", color="#c8ffc8")',
        "  default affection = 0",
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toEqual([]);
      expect(result.stats).toEqual([
        { key: "affection", value: "0", kind: "stat" },
      ]);
      expect(result.cleanedContent).toContain("define e = Character");
      expect(result.cleanedContent).not.toContain("default affection");
      expect(result.cleanedContent.split("\n")[0]).toBe(
        "# [BranchForge] Managed numeric stat defaults were moved out of this file (exported as branchforge_stats.rpy)."
      );
      expect(result.cleanedContent.split("\n")[1]).toBe("");
      expect(result.cleanedContent).toContain("label start:");
      expect(result.cleanedContent).toContain("    return");
    });

    it("does not add a notice when nothing managed was stripped", () => {
      const content = [
        'default mood = "happy"',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.cleanedContent).not.toContain("# [BranchForge]");
      expect(result.cleanedContent).toContain('default mood = "happy"');
    });

    it("preserves an existing managed notice when nothing is stripped", () => {
      // Re-import of already-cleaned content must not wipe the notice.
      const content = [
        BRANCHFORGE_MANAGED_NOTICE,
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.cleanedContent).toBe(content);
      expect(result.characters).toMatchObject([]);
      expect(result.variables).toEqual([]);
      expect(result.stats).toEqual([]);
    });

    it("preserves unparseable Character() definitions instead of stripping them", () => {
      // Complex name expressions remain source-owned rather than risking
      // changes to their Python semantics.
      const content = [
        'define boss = Character(get_boss_name(), color="#ff0000")',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([]);
      expect(result.cleanedContent).toBe(content);
      expect(result.cleanedContent).not.toContain("# [BranchForge]");
    });

    it("keeps a single top notice across re-import (idempotent)", () => {
      const content = [
        BRANCHFORGE_MANAGED_NOTICE,
        "# [BranchForge] Character 'e' moved to Characters → exported as branchforge_definitions.rpy",
        'define e = Character("Eileen", color="#c8ffc8")',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      const lines = result.cleanedContent.split("\n");
      expect(lines[0]).toBe(CHARACTER_NOTICE);
      expect(lines[1]).toBe("");
      expect(lines.filter((l) => l.includes("# [BranchForge]"))).toEqual([
        CHARACTER_NOTICE,
      ]);
      expect(result.cleanedContent).not.toContain("define e = Character");
    });

    it("de-duplicates characters within a single file (first occurrence wins)", () => {
      const content = [
        'define e = Character("Eileen", color="#c8ffc8")',
        'define e = Character("NotEileen", color="#ff0000")',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        { tag: "e", name: "Eileen", color: "#c8ffc8" },
      ]);
    });

    it("handles Character(None, ...) by setting name to null", () => {
      const content = [
        'define n = Character(None, color="#c8c8c8")',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content, undefined, new Set());
      expect(result.characters).toMatchObject([
        { tag: "n", name: null, color: "#c8c8c8" },
      ]);
    });

    it("falls back to default color when none is specified", () => {
      const content = [
        'define s = Character("Sylvie")',
        "",
        "label start:",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toMatchObject([
        { tag: "s", name: "Sylvie", color: "#cfcfcf" },
      ]);
    });

    it("should handle parens inside quoted display names in Character definitions", () => {
      const content = `define c = Character("Name (with parens)", color="#fff")`;
      const result = extractAndStripRpySymbols(content);
      expect(result.characters).toHaveLength(1);
      expect(result.characters[0].tag).toBe("c");
      expect(result.characters[0].name).toBe("Name (with parens)");
    });

    it("preserves dialogue lines that look like assigns but are not define/default", () => {
      const content = [
        "label start:",
        "    $ affection = 10",
        "    return",
      ].join("\n");

      const result = extractAndStripRpySymbols(content);
      // `$ x = 10` is an in-label assignment, not a `default`
      // declaration, and must be preserved.
      expect(result.cleanedContent).toBe(content);
      expect(result.variables).toEqual([]);
      expect(result.stats).toEqual([]);
    });
  });
});
