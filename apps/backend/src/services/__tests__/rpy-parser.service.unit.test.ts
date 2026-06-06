/**
 * RPY Parser Service Tests
 *
 * Unit tests for Ren'Py .rpy file parser.
 * Tests are written before implementation (TDD approach).
 *
 * The parser extracts:
 * - Labels (entry points for scenes/sections)
 * - Dialogue lines (speaker and text)
 * - Menu choices
 * - Jump statements
 * - Character definitions
 */

import { describe, it, expect } from "vitest";
import {
  parseRPYContent,
  extractLabels,
  extractDialogue,
  extractChoices,
  extractJumps,
  parseRPYFile,
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
  reconstructRPYFile,
  addLabelToRPYContent,
  parseLabelBoundaries,
} from "../rpy-parser.service.js";

describe("RPYParserService", () => {
  const sampleRPY = `# Declare characters used in this game
define s = Character("Sylvie", color="#c8ffc8")

default persistent._test_resume = False

# The game starts here
label start:
    "Hello, world!"

    s "Welcome to BranchForge!"

    jump chapter1

label chapter1:
    s "This is chapter 1."

    menu:
        "Choice 1":
            jump route_a

        "Choice 2":
            jump route_b

label route_a:
    s "You chose route A."
    return

label route_b:
    s "You chose route B."
    return
`;

  const minimalRPY = `label start:
    "Hello, world!"
    return
`;

  const complexRPY = `# Init python block
init python:
    import sys

# Image definitions
image bg school = "images/school.jpg"

# Character with image
define e = Character("Eileen", image="eileen")

label first_label:
    scene bg school

    "Narration without speaker."

    e "Hello there!"

    e "How are you doing?"

label second_label:
    menu:
        "I'm good.":
            e "That's great!"

        "Not so good.":
            e "I'm sorry to hear that."

    jump ending

label ending:
    "The end."
    return
`;

  describe("parseRPYContent", () => {
    it("should parse RPY content into structured data", () => {
      const result = parseRPYContent(sampleRPY);

      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    it("should handle empty content", () => {
      const result = parseRPYContent("");

      expect(result).toBeDefined();
      expect(result.labels).toEqual([]);
      expect(result.dialogue).toEqual([]);
    });

    it("should handle minimal RPY file", () => {
      const result = parseRPYContent(minimalRPY);

      expect(result.labels).toContain("start");
      expect(result.dialogue).toHaveLength(1);
    });

    it("should ignore comments", () => {
      const rpyWithComments = `# This is a comment
label start:
    "Not a comment"  # Inline comment should be preserved
    return
`;
      const result = parseRPYContent(rpyWithComments);

      expect(result).toBeDefined();
    });

    it("should handle multiline strings", () => {
      const multilineRPY = `label start:
    """
    This is a multiline
    string that spans
    multiple lines.
    """
    return
`;
      const result = parseRPYContent(multilineRPY);

      expect(result).toBeDefined();
      expect(result.dialogue).toHaveLength(1);
      expect(result.dialogue[0].text).toContain("multiline");
    });
  });

  describe("extractLabels", () => {
    it("should extract all label definitions", () => {
      const labels = extractLabels(sampleRPY);

      expect(labels).toEqual(["start", "chapter1", "route_a", "route_b"]);
    });

    it("should handle labels without statements", () => {
      const emptyLabelRPY = `label first:
label second:
label third:
`;
      const labels = extractLabels(emptyLabelRPY);

      expect(labels).toEqual(["first", "second", "third"]);
    });

    it("should handle labels with parameters", () => {
      const paramLabelRPY = `label first(param1, param2):
    pass
`;
      const labels = extractLabels(paramLabelRPY);

      expect(labels).toEqual(["first"]);
    });

    it("should be case-sensitive", () => {
      const caseLabelRPY = `label Start:
label start:
label START:
`;
      const labels = extractLabels(caseLabelRPY);

      expect(labels).toEqual(["Start", "start", "START"]);
    });

    it("should ignore labels inside strings", () => {
      const stringLabelRPY = `label start:
    "This is not a label: label fake"
    label real:
    return
`;
      const labels = extractLabels(stringLabelRPY);

      expect(labels).toEqual(["start", "real"]);
    });
  });

  describe("extractDialogue", () => {
    it("should extract dialogue with speaker", () => {
      const dialogue = extractDialogue(sampleRPY);

      expect(dialogue).toEqual([
        { speaker: null, text: "Hello, world!" },
        { speaker: "s", text: "Welcome to BranchForge!" },
        { speaker: "s", text: "This is chapter 1." },
        { speaker: "s", text: "You chose route A." },
        { speaker: "s", text: "You chose route B." },
      ]);
    });

    it("should extract dialogue without speaker (narration)", () => {
      const dialogue = extractDialogue(sampleRPY);

      // Find the "Hello, world!" line which has no speaker
      const helloWorld = dialogue.find((d) => d.text === "Hello, world!");
      expect(helloWorld).toBeDefined();
      expect(helloWorld?.speaker).toBeNull();
    });

    it("should preserve whitespace in dialogue", () => {
      const whitespaceRPY = `label start:
    s "Hello  there!  How are you?"
    return
`;
      const dialogue = extractDialogue(whitespaceRPY);

      expect(dialogue[0].text).toBe("Hello  there!  How are you?");
    });

    it("should handle empty dialogue strings", () => {
      const emptyDialogueRPY = `label start:
    s ""
    return
`;
      const dialogue = extractDialogue(emptyDialogueRPY);

      expect(dialogue).toHaveLength(1);
      expect(dialogue[0].text).toBe("");
    });

    it("should handle dialogue with quotes inside", () => {
      const quotedDialogueRPY = `label start:
    s 'She said "Hello" to me'
    return
`;
      const dialogue = extractDialogue(quotedDialogueRPY);

      expect(dialogue[0].text).toBe('She said "Hello" to me');
    });

    it("should handle triple-quoted dialogue", () => {
      const tripleQuotedRPY = `label start:
    s """
    This is a long
    multiline dialogue
    """
    return
`;
      const dialogue = extractDialogue(tripleQuotedRPY);

      expect(dialogue[0].text).toContain("multiline dialogue");
    });

    it("should extract menu titles as editable dialogue", () => {
      const menuRPY = `label start:
    "Before menu"
    menu:
        "Menu title"
        "Choice 1":
            jump somewhere
        "Choice 2":
            jump elsewhere
    "After menu"
`;
      const dialogue = extractDialogue(menuRPY);

      // Menu titles are editable in write mode — extract them as narration
      expect(dialogue).toHaveLength(3);
      expect(dialogue[0].text).toBe("Before menu");
      expect(dialogue[1].text).toBe("Menu title");
      expect(dialogue[2].text).toBe("After menu");
    });
  });

  describe("extractChoices", () => {
    it("should extract menu choices", () => {
      const choices = extractChoices(sampleRPY);

      expect(choices).toEqual([
        { label: "Choice 1", target: "route_a", parentLabel: "chapter1" },
        { label: "Choice 2", target: "route_b", parentLabel: "chapter1" },
      ]);
    });

    it("should handle choices without jumps", () => {
      const choiceWithoutJumpRPY = `label start:
    menu:
        "Just text":
            pass

        "More text":
            pass
`;
      const choices = extractChoices(choiceWithoutJumpRPY);

      expect(choices).toHaveLength(2);
      expect(choices[0].target).toBeNull();
      expect(choices[0].label).toBe("Just text");
    });

    it("should handle nested menus", () => {
      const nestedMenuRPY = `label start:
    menu:
        "First level":
            menu:
                "Second level":
                    jump ending

label ending:
    return
`;
      const choices = extractChoices(nestedMenuRPY);

      expect(choices).toHaveLength(2);
      expect(choices[0].label).toBe("First level");
      expect(choices[1].label).toBe("Second level");
    });

    it("should handle choices with inline actions", () => {
      const inlineChoiceRPY = `label start:
    menu:
        "Show image":
            show bg school

        "Play music":
            play music.bpm
`;
      const choices = extractChoices(inlineChoiceRPY);

      expect(choices).toHaveLength(2);
    });

    it("should handle choices with special characters", () => {
      const specialCharRPY = `label start:
    menu:
        "Choice with "quotes"":
            jump a

        "Choice with 'apostrophes'":
            jump b

        'Choice with "mixed" quotes':
            jump c
`;
      const choices = extractChoices(specialCharRPY);

      expect(choices).toHaveLength(3);
    });
  });

  describe("extractJumps", () => {
    it("should extract jump targets", () => {
      const jumps = extractJumps(sampleRPY);

      expect(jumps).toEqual([
        { from: "start", to: "chapter1" },
        { from: "chapter1", to: "route_a" },
        { from: "chapter1", to: "route_b" },
      ]);
    });

    it("should handle jumps with expressions", () => {
      const expressionJumpRPY = `label start:
    jump expression "chapter_" + str(1)
`;
      const jumps = extractJumps(expressionJumpRPY);

      expect(jumps).toHaveLength(1);
      expect(jumps[0].to).toContain("chapter_");
      expect(jumps[0].from).toBe("start");
    });

    it("should handle if statements", () => {
      const ifJumpRPY = `label start:
    if condition:
        jump route_a
    else:
        jump route_b
`;
      const jumps = extractJumps(ifJumpRPY);

      expect(jumps).toHaveLength(2);
      expect(jumps[0].to).toBe("route_a");
      expect(jumps[1].to).toBe("route_b");
    });

    it("should handle call statements (different from jump)", () => {
      const callJumpRPY = `label start:
    call subroutine
    jump next

label subroutine:
    return

label next:
    return
`;
      const jumps = extractJumps(callJumpRPY);

      // call should be included but marked differently
      const call = jumps.find((j) => j.to === "subroutine");
      const jump = jumps.find((j) => j.to === "next");
      expect(call).toBeDefined();
      expect(jump).toBeDefined();
      expect(call?.isCall).toBe(true);
      expect(jump?.isCall).toBeUndefined();
    });

    it("should handle return statements", () => {
      const returnRPY = `label start:
    "Hello"
    return
`;
      const jumps = extractJumps(returnRPY);

      expect(jumps).toHaveLength(1);
      expect(jumps[0].to).toBe("__return__");
      expect(jumps[0].from).toBe("start");
    });
  });

  describe("parseRPYFile", () => {
    it("should parse a complete RPY file structure", () => {
      const result = parseRPYFile(sampleRPY);

      expect(result).toMatchObject({
        labels: expect.any(Array),
        dialogue: expect.any(Array),
        choices: expect.any(Array),
        jumps: expect.any(Array),
      });
    });

    it("should maintain order of dialogue lines", () => {
      const result = parseRPYFile(sampleRPY);

      const dialogueOrder = result.dialogue.map((d) => d.text);
      expect(dialogueOrder.indexOf("Hello, world!")).toBeLessThan(
        dialogueOrder.indexOf("This is chapter 1.")
      );
    });

    it("should track label hierarchy", () => {
      const result = parseRPYFile(sampleRPY);

      // Choices should have parentLabel information
      const chapter1Choices = result.choices.filter(
        (c) => c.parentLabel === "chapter1"
      );
      expect(chapter1Choices).toHaveLength(2);
    });

    it("should handle complex RPY with multiple features", () => {
      const result = parseRPYFile(complexRPY);

      expect(result.labels.length).toBeGreaterThan(0);
      expect(result.dialogue.length).toBeGreaterThan(0);
      expect(result.choices.length).toBeGreaterThan(0);
      expect(result.jumps.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("should handle invalid RPY syntax gracefully", () => {
      const invalidRPY = `this is not valid rpy syntax [[[[]]]`;

      expect(() => parseRPYContent(invalidRPY)).not.toThrow();
      const result = parseRPYContent(invalidRPY);
      expect(result).toBeDefined();
    });

    it("should handle mixed indentation", () => {
      const mixedIndentRPY = `label start:
  "Two spaces"
    "Four spaces"
\t"Tab character"
`;
      expect(() => parseRPYContent(mixedIndentRPY)).not.toThrow();
    });

    it("should handle unicode characters", () => {
      const unicodeRPY = `label start:
    s "Hello 世界! 🌍"
    s "Café résumé naïve"
`;
      const result = parseRPYContent(unicodeRPY);

      expect(result.dialogue).toHaveLength(2);
      expect(result.dialogue[0].text).toContain("世界");
    });
  });

  describe("edge cases", () => {
    it("should handle labels with numbers", () => {
      const numberedLabelRPY = `label label1:
label label2:
label chapter_3:
`;
      const labels = extractLabels(numberedLabelRPY);

      expect(labels).toEqual(["label1", "label2", "chapter_3"]);
    });

    it("should handle labels with underscores", () => {
      const underscoredLabelRPY = `label chapter_1_scene_2:
label _private_label:
`;
      const labels = extractLabels(underscoredLabelRPY);

      expect(labels).toEqual(["chapter_1_scene_2", "_private_label"]);
    });

    it("should ignore python blocks", () => {
      const pythonBlockRPY = `init python:
    def my_function():
        pass

label start:
    "Hello"
    return
`;
      const result = parseRPYContent(pythonBlockRPY);

      // Python code shouldn't interfere with label extraction
      expect(result.labels).toContain("start");
    });

    it("should handle screen statements", () => {
      const screenRPY = `screen my_screen():
    text "Hello"

label start:
    "World"
    return
`;
      const result = parseRPYContent(screenRPY);

      expect(result.labels).toContain("start");
    });
  });

  describe("parseRPYFileWithLabels", () => {
    const storyRPY = `# Character definition
define s = Character("Sylvie")

label start:
    "Hello, world!"
    s "Welcome!"

label chapter1:
    s "This is chapter 1."
    "Narration here."
`;

    const settingsRPY = `# Settings file with no labels
define s = Character("Sylvie")
define e = Character("Eileen")

screen my_screen():
    text "Hello"

init python:
    def my_function():
        pass
`;

    const mixedRPY = `# File with both character definitions and labels
define s = Character("Sylvie")

label start:
    s "Hello!"
    return
`;

    it("should detect STORY file type when labels are present", () => {
      const result = parseRPYFileWithLabels(storyRPY);

      expect(result.fileType).toBe("STORY");
    });

    it("should detect SETTINGS file type when only definitions are present", () => {
      const result = parseRPYFileWithLabels(settingsRPY);

      expect(result.fileType).toBe("SETTINGS");
    });

    it("should detect STORY file type when both labels and definitions are present", () => {
      const result = parseRPYFileWithLabels(mixedRPY);

      expect(result.fileType).toBe("STORY");
    });

    it("should extract characters from the file", () => {
      const result = parseRPYFileWithLabels(storyRPY);

      expect(result.characters).toHaveLength(1);
      expect(result.characters[0].tag).toBe("s");
      expect(result.characters[0].name).toBe("Sylvie");
    });

    it("should parse labels with their dialogue", () => {
      const result = parseRPYFileWithLabels(storyRPY);

      expect(result.labels).toHaveLength(2);

      const startLabel = result.labels.find((l) => l.label === "start");
      expect(startLabel).toBeDefined();
      expect(startLabel?.dialogue).toHaveLength(2);
      expect(startLabel?.dialogue[0].speaker).toBeNull();
      expect(startLabel?.dialogue[0].text).toBe("Hello, world!");
    });

    it("should not include invalid labels in result", () => {
      const rpyWithInvalid = `label start:
    "Valid"

label _:
    "Invalid"

label _private:
    "Also invalid"

label a:
    "Single char - invalid"
`;
      const result = parseRPYFileWithLabels(rpyWithInvalid);

      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].label).toBe("start");
    });

    it("should track line numbers for dialogue", () => {
      const rpy = `label start:
    "Line 2"
    s "Line 3"
`;
      const result = parseRPYFileWithLabels(rpy);

      const startLabel = result.labels.find((l) => l.label === "start");
      expect(startLabel?.dialogue[0].lineNumber).toBe(2);
      expect(startLabel?.dialogue[1].lineNumber).toBe(3);
    });

    it("should handle empty file", () => {
      const result = parseRPYFileWithLabels("");

      expect(result.fileType).toBe("SETTINGS");
      expect(result.labels).toEqual([]);
      expect(result.characters).toEqual([]);
    });

    it("should skip labels inside screen blocks", () => {
      const rpyWithScreens = `# Settings file
define s = Character("Sylvie")

screen game_menu():
    tag menu
    frame:
        ## These should NOT be parsed as story labels
        for i in range(3):
            $ file_text = "slot"
            button:
                text file_text

screen about():
    text "About"
    ## Internal identifiers should not be labels
    $ page_label = "about"

# This should be the only parsed label
label start:
    "Hello, world!"
    s "Welcome!"
`;

      const result = parseRPYFileWithLabels(rpyWithScreens);

      // Should only parse the actual story label, not screen internals
      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].label).toBe("start");
      expect(result.labels[0].dialogue).toHaveLength(2);
    });

    it("should skip labels inside init offset blocks", () => {
      const rpyWithInitOffset = `label start:
    "Before init"

init 1:
    label internal_init_label:
        "This should be skipped"

label after_init:
    "After init"
`;

      const result = parseRPYFileWithLabels(rpyWithInitOffset);

      // Should skip the label inside init offset block
      expect(result.labels).toHaveLength(2);
      expect(result.labels.map((l) => l.label)).toEqual([
        "start",
        "after_init",
      ]);
    });

    it("should classify files with many screens and few labels as SETTINGS", () => {
      // Simulates screens.rpy: many screen definitions, few/no story labels
      const screensFile = `screen main_menu():
    pass

screen game_menu():
    pass

screen about():
    pass

screen preferences():
    pass

screen save():
    pass

screen load():
    pass

screen choices():
    pass

screen say():
    pass

label title:
    # This is a UI label, not a story label
    pass
`;

      const result = parseRPYFileWithLabels(screensFile);

      // Heuristic: parseRPYFileWithLabels classifies files as SETTINGS when
      // screenCount > labelCount * 2 (more than 2:1 screens-to-labels ratio)
      // This case: 8 screens, 1 label → 8 > 1 * 2 → triggers SETTINGS classification
      // which filters out the UI label, resulting in empty labels array
      expect(result.fileType).toBe("SETTINGS");
      expect(result.labels).toHaveLength(0);
    });

    it("should classify files with 'screen' in filename as SETTINGS regardless of content", () => {
      const contentWithLabel = `label start:
    "This is actual dialogue"
    s "More dialogue"
`;

      // Without filename, would be classified as STORY
      const resultWithoutFilename = parseRPYFileWithLabels(contentWithLabel);
      expect(resultWithoutFilename.fileType).toBe("STORY");

      // With exact screen definition filename, should be classified as SETTINGS
      const resultWithFilename = parseRPYFileWithLabels(
        contentWithLabel,
        "screens.rpy"
      );
      expect(resultWithFilename.fileType).toBe("SETTINGS");

      // Case insensitive for exact match
      const resultWithCaps = parseRPYFileWithLabels(
        contentWithLabel,
        "Screens.rpy"
      );
      expect(resultWithCaps.fileType).toBe("SETTINGS");

      // Singular "screen.rpy" is also recognized
      const resultWithSingular = parseRPYFileWithLabels(
        contentWithLabel,
        "screen.rpy"
      );
      expect(resultWithSingular.fileType).toBe("SETTINGS");

      // Files with "screen" in name but not exact match are NOT classified as SETTINGS
      // This prevents misclassifying files like "screenshot.rpy" or "my-screen-scene.rpy"
      const resultWithPartial = parseRPYFileWithLabels(
        contentWithLabel,
        "screenshot.rpy"
      );
      expect(resultWithPartial.fileType).toBe("STORY");
    });

    it("should extract menu titles as editable dialogue in label dialogue", () => {
      const menuRPY = `label start:
    "Before menu"
    menu:
        "Menu title"
        "Choice 1":
            jump somewhere
        "Choice 2":
            jump elsewhere
    "After menu"
`;
      const result = parseRPYFileWithLabels(menuRPY);

      const startLabel = result.labels.find((l) => l.label === "start");
      expect(startLabel).toBeDefined();

      // Menu titles are editable in write mode — extract them as narration
      expect(startLabel?.dialogue).toHaveLength(3);
      expect(startLabel?.dialogue[0].text).toBe("Before menu");
      expect(startLabel?.dialogue[1].text).toBe("Menu title");
      expect(startLabel?.dialogue[2].text).toBe("After menu");
    });
  });

  describe("convertToBranchForgeFormatFromLabels", () => {
    const parsedData = {
      labels: [
        {
          label: "start",
          lineNumber: 1,
          dialogue: [
            { speaker: null, text: "Hello world!", lineNumber: 2 },
            { speaker: "s", text: "Welcome!", lineNumber: 3 },
          ],
          choices: [],
          jumps: [],
        },
        {
          label: "chapter1",
          lineNumber: 5,
          dialogue: [{ speaker: "s", text: "Chapter content", lineNumber: 6 }],
          choices: [{ label: "Choice 1", target: "route_a", lineNumber: 7 }],
          jumps: [{ to: "ending", lineNumber: 8 }],
        },
      ],
      characters: [{ tag: "s", name: "Sylvie", color: "#c8ffc8" }],
      fileType: "STORY" as const,
    };

    const originalContent = `label start:
    "Hello world!"
    s "Welcome!"

label chapter1:
    s "Chapter content"
`;

    it("should convert label to BranchForge scene format", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "start",
        originalContent
      );

      expect(result.name).toBe("start");
      expect(result.entries).toHaveLength(2);
      expect(result.characters).toHaveLength(1);
    });

    it("should create DIALOGUE entries for lines with speakers", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "start",
        originalContent
      );

      const dialogueEntry = result.entries.find((e) => e.type === "DIALOGUE");
      expect(dialogueEntry).toBeDefined();
      expect(dialogueEntry?.speaker).toBe("s");
      expect(dialogueEntry?.text).toBe("Welcome!");
    });

    it("should create NARRATION entries for lines without speakers", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "start",
        originalContent
      );

      const narrationEntry = result.entries.find((e) => e.type === "NARRATION");
      expect(narrationEntry).toBeDefined();
      expect(narrationEntry?.text).toBe("Hello world!");
    });

    it("should create FLAG entries for choices", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "chapter1",
        originalContent
      );

      const flagEntry = result.entries.find((e) => e.type === "FLAG");
      expect(flagEntry).toBeDefined();
      expect(flagEntry?.text).toBe("Choice 1");
      expect(flagEntry?.target).toBe("route_a");
    });

    it("should create JUMP entries for jumps", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "chapter1",
        originalContent
      );

      const jumpEntry = result.entries.find((e) => e.type === "JUMP");
      expect(jumpEntry).toBeDefined();
      expect(jumpEntry?.target).toBe("ending");
    });

    it("should return empty scene for non-existent label", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "nonexistent",
        originalContent
      );

      expect(result.name).toBe("nonexistent");
      expect(result.entries).toEqual([]);
      expect(result.characters).toEqual([]);
    });

    it("should extract unique speakers from label dialogue", () => {
      const result = convertToBranchForgeFormatFromLabels(
        parsedData,
        "start",
        originalContent
      );

      expect(result.characters).toHaveLength(1);
      expect(result.characters?.[0].tag).toBe("s");
      expect(result.characters?.[0].name).toBe("Sylvie");
    });

    it("should skip empty dialogue entries", () => {
      const parsedWithEmpty = {
        ...parsedData,
        labels: [
          {
            ...parsedData.labels[0],
            dialogue: [
              { speaker: null, text: "", lineNumber: 2 },
              { speaker: null, text: "   ", lineNumber: 3 },
              { speaker: null, text: "Valid text", lineNumber: 4 },
            ],
          },
        ],
      };

      const result = convertToBranchForgeFormatFromLabels(
        parsedWithEmpty,
        "start",
        originalContent
      );

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].text).toBe("Valid text");
    });

    it("should calculate indent level from original content", () => {
      const contentWithIndent = `label start:
    "Four spaces"
        "Eight spaces"
  "Two spaces"
`;

      const parsed = {
        labels: [
          {
            label: "start",
            lineNumber: 1,
            dialogue: [
              { speaker: null, text: "Four spaces", lineNumber: 2 },
              { speaker: null, text: "Eight spaces", lineNumber: 3 },
              { speaker: null, text: "Two spaces", lineNumber: 4 },
            ],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: "STORY" as const,
      };

      const result = convertToBranchForgeFormatFromLabels(
        parsed,
        "start",
        contentWithIndent
      );

      expect(result.entries[0].indentLevel).toBe(1); // 4 spaces / 4
      expect(result.entries[1].indentLevel).toBe(2); // 8 spaces / 4
      expect(result.entries[2].indentLevel).toBe(0); // 2 spaces / 4 (rounded down)
    });
  });

  describe("reconstructRPYFile", () => {
    const originalContent = `label start:
    "Original line 1"
    s "Original line 2"

label chapter1:
    "Chapter content"
`;

    it("should replace dialogue with updated content", () => {
      const updatedDialogue = new Map([
        [
          "start",
          [
            { speaker: null, text: "Updated line 1" },
            { speaker: "s", text: "Updated line 2" },
          ],
        ],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      expect(result).toContain('Updated line 1"');
      expect(result).toContain('s "Updated line 2"');
      expect(result).not.toContain("Original line 1");
    });

    it("should preserve non-dialogue lines", () => {
      const updatedDialogue = new Map([
        ["start", [{ speaker: null, text: "Updated" }]],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // Should preserve label declarations and other keywords
      expect(result).toContain("label start:");
      expect(result).toContain("label chapter1:");
    });

    it("should handle fewer updated entries than original", () => {
      const updatedDialogue = new Map([
        ["start", [{ speaker: null, text: "Only one line" }]],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // Original lines should be preserved when update has fewer entries
      expect(result).toContain('Only one line"');
      // The second original line should still be there (preserved)
      expect(result).toContain('s "Original line 2"');
    });

    it("should append extra updated dialogue entries", () => {
      const updatedDialogue = new Map([
        [
          "start",
          [
            { speaker: null, text: "Line 1" },
            { speaker: null, text: "Line 2" },
            { speaker: null, text: "Line 3 (extra)" },
          ],
        ],
      ]);

      const result = reconstructRPYFile({
        originalContent: `label start:
    "Original 1"
    "Original 2"
`,
        updatedDialogue,
      });

      expect(result).toContain('Line 1"');
      expect(result).toContain('Line 2"');
      expect(result).toContain('Line 3 (extra)"');
    });

    it("should preserve original indentation", () => {
      const indentedContent = `label start:
  "Two spaces"
    "Four spaces"
`;

      const updatedDialogue = new Map([
        ["start", [{ speaker: null, text: "Updated" }]],
      ]);

      const result = reconstructRPYFile({
        originalContent: indentedContent,
        updatedDialogue,
      });

      // Should maintain the original indentation
      expect(result).toContain('  "Updated"');
    });

    it("should handle labels with no updates", () => {
      const updatedDialogue = new Map([
        ["chapter1", [{ speaker: null, text: "Chapter updated" }]],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // start label should keep original content
      expect(result).toContain("Original line 1");
      expect(result).toContain("Original line 2");
      // chapter1 label should be updated
      expect(result).toContain("Chapter updated");
    });

    it("should handle empty updated dialogue map", () => {
      const updatedDialogue = new Map();

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // Original content should be preserved
      expect(result).toBe(originalContent);
    });

    it("should handle labels not in original content", () => {
      const updatedDialogue = new Map([
        ["new_label", [{ speaker: null, text: "New label content" }]],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // New label content should be appended
      expect(result).toContain("New label content");
    });

    it("should properly reconstruct dialogue with speakers", () => {
      const content = `label start:
    s "Hello"
    "World"
`;

      const updatedDialogue = new Map([
        ["start", [{ speaker: "e", text: "Updated speaker" }]],
      ]);

      const result = reconstructRPYFile({
        originalContent: content,
        updatedDialogue,
      });

      expect(result).toContain('e "Updated speaker"');
    });

    it("should NOT duplicate menu title during reconstruction", () => {
      const originalContent = `label start:
    "Some narration"
    menu:
        "Are you sure?"
        "Yes":
            jump yes_label
        "No":
            jump no_label
`;

      const updatedDialogue = new Map([
        [
          "start",
          [
            { speaker: null, text: "Some narration" },
            { speaker: null, text: "Are you sure?" },
          ],
        ],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // The menu title "Are you sure?" should NOT be duplicated outside the menu
      expect(result).toContain("menu:");
      expect(result).toContain('"Are you sure?"');

      // Count occurrences of "Are you sure?" - should be exactly 1.
      // Pre-fix, the second entry would be inserted before `menu:` and the
      // original title line preserved inside the menu, producing two matches.
      const matches = result.match(/"Are you sure\?"/g);
      expect(matches).toHaveLength(1);
    });

    it("should NOT duplicate jump statements during reconstruction", () => {
      const originalContent = `label end:
    ma "Always."
    jump end
`;

      const updatedDialogue = new Map([
        ["end", [{ speaker: "ma", text: "Always." }]],
      ]);

      const result = reconstructRPYFile({
        originalContent,
        updatedDialogue,
      });

      // Should contain the jump statement exactly once
      const jumpMatches = result.match(/jump end/g);
      expect(jumpMatches).toHaveLength(1);

      // Should NOT contain jump statement as a dialogue string
      expect(result).not.toContain('"jump end"');

      // Verify the reconstruction preserves the original structure
      expect(result).toContain('ma "Always."');
      expect(result).toContain("jump end");
    });
  });

  describe("addLabelToRPYContent", () => {
    it("should insert label at end when afterLabelName is null", () => {
      const content = `label first:
    return`;
      const result = addLabelToRPYContent(content, "new_label");
      expect(result).toContain("label new_label:");
      expect(result).toContain("label first:");
      // New label should come after the original label
      expect(result.indexOf("label first:")).toBeLessThan(
        result.indexOf("label new_label:")
      );
    });

    it("should insert label after specified label", () => {
      const content = `label first:
    return

label second:
    return`;
      const result = addLabelToRPYContent(content, "middle", "first");
      expect(result).toContain("label middle:");
      // Verify the order: first, middle, second
      const firstIndex = result.indexOf("label first:");
      const middleIndex = result.indexOf("label middle:");
      const secondIndex = result.indexOf("label second:");
      expect(firstIndex).toBeLessThan(middleIndex);
      expect(middleIndex).toBeLessThan(secondIndex);
    });

    it("should throw error if afterLabelName not found", () => {
      const content = `label first:
    return`;
      expect(() => addLabelToRPYContent(content, "new", "nonexistent")).toThrow(
        'Label "nonexistent" not found in RPY content'
      );
    });

    it("should preserve indentation", () => {
      const content = `label first:
    return`;
      const result = addLabelToRPYContent(content, "second");
      expect(result).toMatch(/label second:\n {4}return/);
    });

    it("should handle empty file", () => {
      const result = addLabelToRPYContent("", "first_label");
      expect(result).toContain("label first_label:");
      expect(result).toContain("return");
    });

    it("should handle file with no labels", () => {
      const content = `# Character definitions
define e = Character("Eileen")`;
      const result = addLabelToRPYContent(content, "first_label");
      expect(result).toContain("# Character definitions");
      expect(result).toContain("label first_label:");
    });

    it("should add blank line before new label when inserting at end", () => {
      const content = `label first:
    return`;
      const result = addLabelToRPYContent(content, "second");
      // Should have a blank line between labels
      expect(result).toMatch(/return\n\nlabel second:/);
    });

    it("should add blank line before new label when inserting after label", () => {
      const content = `label first:
    return
label second:
    return`;
      const result = addLabelToRPYContent(content, "middle", "first");
      // Should have a blank line between first and middle
      expect(result).toMatch(/label first:.*return\n\nlabel middle:/s);
    });

    it("should insert label with content that has complex blocks", () => {
      const content = `label first:
    if True:
        "Yes"
    else:
        "No"
    return`;
      const result = addLabelToRPYContent(content, "second", "first");
      expect(result).toContain("label second:");
      // Should preserve the if/else block in first label
      expect(result).toContain("if True:");
      expect(result).toContain("else:");
    });

    it("should detect indentation from existing labels", () => {
      const content = `label first:
  return`;
      const result = addLabelToRPYContent(content, "second");
      // Should use 2 spaces if that's what the existing label uses
      expect(result).toMatch(/label second:\n {2}return/);
    });

    it("should default to 4 spaces when no indentation can be detected", () => {
      const result = addLabelToRPYContent("", "first_label");
      expect(result).toMatch(/label first_label:\n {4}return/);
    });
  });

  describe("parseLabelBoundaries", () => {
    it("should parse simple labels", () => {
      const content = `label a:
    return
label b:
    return`;
      const result = parseLabelBoundaries(content);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("a");
      expect(result[1].name).toBe("b");
    });

    it("should handle labels with complex content", () => {
      const content = `label a:
    if True:
        "test"
    return`;
      const result = parseLabelBoundaries(content);
      expect(result[0].endLine).toBeGreaterThan(result[0].startLine);
      expect(result[0].endLine).toBe(3); // Line 0-3 inclusive
    });

    it("should handle empty file", () => {
      const result = parseLabelBoundaries("");
      expect(result).toHaveLength(0);
    });

    it("should handle labels with if/else blocks", () => {
      const content = `label a:
    if True:
        "yes"
    else:
        "no"
    return`;
      const result = parseLabelBoundaries(content);
      expect(result[0].endLine).toBe(5); // Lines 0-5 inclusive
    });

    it("should handle labels with menu blocks", () => {
      const content = `label a:
    menu:
        "Choice 1":
            jump route1
        "Choice 2":
            jump route2
    return`;
      const result = parseLabelBoundaries(content);
      expect(result[0].endLine).toBeGreaterThan(result[0].startLine);
      expect(result[0].endLine).toBe(6); // Lines 0-6 inclusive (not 7)
    });

    it("should track correct line numbers", () => {
      const content = `label first:
    return

label second:
    return`;
      const result = parseLabelBoundaries(content);
      expect(result[0].startLine).toBe(0);
      expect(result[0].endLine).toBe(1);
      expect(result[1].startLine).toBe(3);
      expect(result[1].endLine).toBe(4);
    });

    it("should handle labels with nested blocks", () => {
      const content = `label a:
    if condition1:
        if condition2:
            "deeply nested"
    return`;
      const result = parseLabelBoundaries(content);
      expect(result[0].startLine).toBe(0);
      expect(result[0].endLine).toBe(4);
    });
  });
});
