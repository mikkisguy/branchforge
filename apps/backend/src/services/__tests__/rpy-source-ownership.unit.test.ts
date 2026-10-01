import { describe, expect, it } from "vitest";
import {
  collectSourceOwnedRpyDeclarations,
  extractAndStripRpySymbols,
  isSourceOwnedRpyFile,
} from "../rpy-statements.service.js";
import { parseRPYFileWithLabels } from "../rpy-parser.service.js";

describe("Ren'Py source ownership", () => {
  it.each([
    "screens.rpy",
    "game/ui/SCREENS.RPY",
    "game\\screen.rpy",
    "game/options.rpy",
    "game/gui.rpy",
  ])("preserves all declarations in %s verbatim", (filePath) => {
    const content = [
      "# Author's settings",
      "default quick_menu = True # display the menu",
      "default future_option = False",
      "default future_number = 42",
      'define ui_character = Character("UI")',
      "",
    ].join("\r\n");
    expect(isSourceOwnedRpyFile(filePath)).toBe(true);
    expect(extractAndStripRpySymbols(content, filePath)).toEqual({
      cleanedContent: content,
      characters: [],
      variables: [],
      stats: [],
    });
  });

  it.each(["variables.rpy", "characters.rpy", "game/screens/dialogue.rpy"])(
    "continues managing story symbols in %s",
    (filePath) => {
      expect(isSourceOwnedRpyFile(filePath)).toBe(false);
      const result = extractAndStripRpySymbols(
        "default met_nelson = False",
        filePath
      );
      expect(result.variables[0]?.key).toBe("met_nelson");
    }
  );

  it.each(["game/options.rpy", "game/gui.rpy"])(
    "does not import labels from %s",
    (filePath) => {
      const parsed = parseRPYFileWithLabels(
        "label custom_ui:\n    return",
        filePath
      );
      expect(parsed.fileType).toBe("SETTINGS");
      expect(parsed.labels).toEqual([]);
    }
  );

  it("collects global assignments without claiming screen locals, dotted namespaces, or text", () => {
    const content = [
      "default quick_menu = True",
      'default future_text = "hello"',
      "default expression = choose_value()",
      'define ui_character = Character("UI")',
      "default persistent.age_verified = False",
      "define gui.text_size = 30",
      "# default commented_out = False",
      "screen custom_ui():",
      "    default local_state = False",
      'define config.about = """',
      "default quoted_example = False",
      '"""',
    ].join("\n");
    expect([...collectSourceOwnedRpyDeclarations(content)]).toEqual([
      "quick_menu",
      "future_text",
      "expression",
      "ui_character",
    ]);
  });

  it("collects globals in init blocks while excluding nested screen defaults", () => {
    const content = [
      "init:",
      "    default initialized_flag = True",
      '    define ui_character = Character("UI")',
      "    screen custom_ui():",
      "        default local_flag = False",
      "    default another_global = False",
      "init -1 define inline_global = True",
      "init screen inline_ui():",
      "    default inline_local = False",
    ].join("\n");
    expect([...collectSourceOwnedRpyDeclarations(content)]).toEqual([
      "initialized_flag",
      "ui_character",
      "another_global",
      "inline_global",
    ]);
  });

  it("only describes character moves and retains persistent settings and name constants", () => {
    const content = [
      "default persistent.age_verified = False",
      'default persistent.pl_nickname = ""',
      'define ne_first = "Nelson"',
      'define ne_last = "Stone"',
      'define ne = Character("Nelson")',
    ].join("\n");
    const result = extractAndStripRpySymbols(content, "game/variables.rpy");
    expect(result.cleanedContent).toContain(
      "Managed character definitions were moved"
    );
    expect(result.cleanedContent).toContain("branchforge_definitions.rpy");
    expect(result.cleanedContent).not.toContain("branchforge_variables.rpy");
    expect(result.cleanedContent).not.toContain("branchforge_stats.rpy");
    expect(result.cleanedContent).toContain(
      "default persistent.age_verified = False"
    );
    expect(result.cleanedContent).toContain(
      'default persistent.pl_nickname = ""'
    );
    expect(result.cleanedContent).toContain('define ne_first = "Nelson"');
    expect(result.cleanedContent).toContain('define ne_last = "Stone"');
    expect(
      extractAndStripRpySymbols(result.cleanedContent, "game/variables.rpy")
        .cleanedContent
    ).toBe(result.cleanedContent);
  });
});
