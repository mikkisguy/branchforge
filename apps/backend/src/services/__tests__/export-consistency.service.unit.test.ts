/**
 * Export Consistency Guard Tests
 *
 * Regression tests for the shared export-consistency assertion: an
 * excluded DB character without any current active exported
 * source-owned global declaration must raise an actionable
 * ConflictError instead of silently disappearing from the export
 * (e.g. a legacy DB row `u` / `"???"` / `#E4E4E4` under old defaults
 * that excluded `u`).
 */

import { describe, it, expect } from "vitest";
import { ConflictError } from "../../middleware/error-handler.middleware.js";
import { assertExcludedCharactersHaveSourceOwnership } from "../export-consistency.service.js";

describe("assertExcludedCharactersHaveSourceOwnership", () => {
  it("conflicts when an excluded DB character has no source declaration", () => {
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }],
        new Set(["narrator", "u"]),
        [{ filePath: "game/script.rpy", content: "label start:\n    return" }]
      )
    ).toThrow(ConflictError);
  });

  it.each(["narrator", "extend"])(
    "allows RenPy built-in %s without a custom source declaration",
    (renpyTag) => {
      expect(() =>
        assertExcludedCharactersHaveSourceOwnership(
          [{ renpyTag }],
          new Set([renpyTag]),
          [{ filePath: "game/script.rpy", content: "label start:\n    return" }]
        )
      ).not.toThrow();
    }
  );

  it("does not treat a saved template as a surviving ordinary declaration", () => {
    const character = {
      renpyTag: "u",
      sourceDefinition: {
        declaration: 'define u = Character("???", color="#E4E4E4")',
        name: "???",
        nameType: "unknown",
        color: "#E4E4E4",
      },
    };
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership([character], new Set(["u"]), [
        { filePath: "game/script.rpy", content: "label start:\n    return" },
      ])
    ).toThrow(ConflictError);
  });

  it("names the missing tag in an actionable message", () => {
    try {
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }],
        new Set(["narrator", "u"]),
        [{ filePath: "game/script.rpy", content: "label start:\n    return" }]
      );
      expect.unreachable("expected ConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toContain("u");
      expect((error as Error).message).toContain("excluded character tags");
    }
  });

  it("passes when the excluded declaration lives in a normal project file", () => {
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }],
        new Set(["narrator", "u"]),
        [
          {
            filePath: "game/script.rpy",
            content:
              'define u = Character("???", color="#E4E4E4")\nlabel start:\n    return',
          },
        ]
      )
    ).not.toThrow();
  });

  it("passes when the excluded declaration lives in a protected source file", () => {
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "ui_character" }],
        new Set(["narrator", "ui_character"]),
        [
          {
            filePath: "game/screens.rpy",
            content:
              'define ui_character = Character("UI")\nlabel start:\n    return',
          },
        ]
      )
    ).not.toThrow();
  });

  it.each(["game/branchforge_cast.rpy", "game\\BRANCHFORGE_CAST.RPY"])(
    "accepts authored declarations in %s",
    (filePath) => {
      expect(() =>
        assertExcludedCharactersHaveSourceOwnership(
          [{ renpyTag: "u" }],
          new Set(["u"]),
          [{ filePath, content: 'define u = Character("???")' }]
        )
      ).not.toThrow();
    }
  );

  it("preserves an unsafe-to-manage source declaration as ownership evidence", () => {
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }],
        new Set(["u"]),
        [
          {
            filePath: "game/cast.rpy",
            content: "define u = Character(get_name())",
          },
        ]
      )
    ).not.toThrow();
  });

  it.each([
    "game/branchforge_definitions.rpy",
    "game/branchforge_variables.rpy",
    "game\\BRANCHFORGE_STATS.RPY",
  ])("ignores stale generated output %s as evidence", (filePath) => {
    // A stale generated file containing the declaration must not satisfy
    // the guard — generated outputs are rewritten from the DB, not owned
    // by the user's project.
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }],
        new Set(["narrator", "u"]),
        [
          {
            filePath,
            content:
              'define u = Character("???", color="#E4E4E4")\nlabel start:\n    return',
          },
          { filePath: "game/script.rpy", content: "label start:\n    return" },
        ]
      )
    ).toThrow(ConflictError);
  });

  it("does not conflict for non-excluded characters", () => {
    expect(() =>
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }],
        new Set(["narrator"]),
        [{ filePath: "game/script.rpy", content: "label start:\n    return" }]
      )
    ).not.toThrow();
  });

  it("reports every missing excluded tag at once", () => {
    try {
      assertExcludedCharactersHaveSourceOwnership(
        [{ renpyTag: "u" }, { renpyTag: "ghost" }],
        new Set(["narrator", "u", "ghost"]),
        [{ filePath: "game/script.rpy", content: "label start:\n    return" }]
      );
      expect.unreachable("expected ConflictError");
    } catch (error) {
      expect((error as Error).message).toContain("u");
      expect((error as Error).message).toContain("ghost");
    }
  });
});
