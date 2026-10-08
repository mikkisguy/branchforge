import { describe, it, expect } from "vitest";
import {
  hasUnpushedLocalContent,
  localContentBaselineHash,
} from "../project-file-baseline.js";
import { calculateContentHash } from "../../lib/hash.js";
import {
  BRANCHFORGE_MANAGED_NOTICE,
  extractAndStripRpySymbols,
  extractLegacyRpySymbols,
} from "../rpy-statements.service.js";

describe("project-file-baseline", () => {
  it("recognizes category-specific historical notices after ownership changes", () => {
    const originalContent =
      "define narrator = Character(None, what_italic=True)\nlabel start:\n    return";
    const contentHash = calculateContentHash(
      extractLegacyRpySymbols(originalContent).cleanedContent
    );
    expect(
      hasUnpushedLocalContent({
        filePath: "game/script.rpy",
        originalContent,
        contentHash,
        lastPushedContentHash: null,
      })
    ).toBe(false);
  });

  it("uses custom exclusion ownership when reconstructing a baseline", () => {
    const originalContent =
      "define thought = Character(None, what_italic=False)\nlabel start:\n    return";
    const excluded = new Set(["thought"]);
    const contentHash = calculateContentHash(
      extractAndStripRpySymbols(originalContent, "game/script.rpy", excluded)
        .cleanedContent
    );
    expect(
      hasUnpushedLocalContent(
        {
          filePath: "game/script.rpy",
          originalContent,
          contentHash,
          lastPushedContentHash: null,
        },
        excluded
      )
    ).toBe(false);
  });
  it.each(["game/script.rpy", "game/screens.rpy"])(
    "recognizes an untouched legacy stripped baseline for %s",
    (filePath) => {
      const originalContent =
        "default quick_menu = True\nlabel start:\n    return";
      const contentHash = calculateContentHash(
        `${BRANCHFORGE_MANAGED_NOTICE}\n\nlabel start:\n    return`
      );
      const file = {
        filePath,
        originalContent,
        contentHash,
        lastPushedContentHash: null,
      };
      expect(hasUnpushedLocalContent(file)).toBe(false);
      expect(localContentBaselineHash(file)).toBe(contentHash);
      expect(hasUnpushedLocalContent({ ...file, contentHash: "edited" })).toBe(
        true
      );
    }
  );

  it("prefers lastPushedContentHash when present", () => {
    expect(
      localContentBaselineHash({
        filePath: "game/variables.rpy",
        lastPushedContentHash: "pushed-hash",
        originalContent: 'label start:\n    "Original"\n    return',
      })
    ).toBe("pushed-hash");
  });

  it("falls back to cleaned originalContent hash", () => {
    const original = 'label start:\n    "Original"\n    return';
    expect(
      localContentBaselineHash({
        filePath: "game/variables.rpy",
        lastPushedContentHash: null,
        originalContent: original,
      })
    ).toBe(calculateContentHash(original));
  });

  it("uses raw originalContent for source-owned files", () => {
    const original =
      'default quick_menu = True\nscreen quick_menu():\n    text "Menu"\n';
    const guiPath = "game/gui.rpy";
    expect(
      localContentBaselineHash({
        filePath: guiPath,
        lastPushedContentHash: null,
        originalContent: original,
      })
    ).toBe(calculateContentHash(original));
    expect(
      hasUnpushedLocalContent({
        filePath: guiPath,
        contentHash: calculateContentHash(original),
        lastPushedContentHash: null,
        originalContent: original,
      })
    ).toBe(false);
    expect(
      hasUnpushedLocalContent({
        filePath: guiPath,
        contentHash: calculateContentHash(
          'label start:\n    "Edited"\n    return'
        ),
        lastPushedContentHash: null,
        originalContent: original,
      })
    ).toBe(true);
  });

  it("returns null when no baseline exists", () => {
    expect(
      localContentBaselineHash({
        filePath: "game/variables.rpy",
        lastPushedContentHash: null,
        originalContent: null,
      })
    ).toBeNull();
  });

  it("detects unpushed local content against the baseline", () => {
    expect(
      hasUnpushedLocalContent({
        filePath: "game/variables.rpy",
        contentHash: "local-hash",
        lastPushedContentHash: "pushed-hash",
        originalContent: null,
      })
    ).toBe(true);

    expect(
      hasUnpushedLocalContent({
        filePath: "game/variables.rpy",
        contentHash: "pushed-hash",
        lastPushedContentHash: "pushed-hash",
        originalContent: null,
      })
    ).toBe(false);

    expect(
      hasUnpushedLocalContent({
        filePath: "game/variables.rpy",
        contentHash: "local-hash",
        lastPushedContentHash: null,
        originalContent: null,
      })
    ).toBe(false);
  });
});
