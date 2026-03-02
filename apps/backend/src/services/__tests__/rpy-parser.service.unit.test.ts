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

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRPYContent,
  extractLabels,
  extractDialogue,
  extractChoices,
  extractJumps,
  parseRPYFile,
  convertToBranchForgeFormat,
} from '../rpy-parser.service.js';

describe('RPYParserService', () => {
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

  beforeEach(() => {
    // Reset any state before each test
  });

  describe('parseRPYContent', () => {
    it('should parse RPY content into structured data', () => {
      const result = parseRPYContent(sampleRPY);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should handle empty content', () => {
      const result = parseRPYContent('');

      expect(result).toBeDefined();
      expect(result.labels).toEqual([]);
      expect(result.dialogue).toEqual([]);
    });

    it('should handle minimal RPY file', () => {
      const result = parseRPYContent(minimalRPY);

      expect(result.labels).toContain('start');
      expect(result.dialogue).toHaveLength(1);
    });

    it('should ignore comments', () => {
      const rpyWithComments = `# This is a comment
label start:
    "Not a comment"  # Inline comment should be preserved
    return
`;
      const result = parseRPYContent(rpyWithComments);

      expect(result).toBeDefined();
    });

    it('should handle multiline strings', () => {
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
    });
  });

  describe('extractLabels', () => {
    it('should extract all label definitions', () => {
      const labels = extractLabels(sampleRPY);

      expect(labels).toEqual(['start', 'chapter1', 'route_a', 'route_b']);
    });

    it('should handle labels without statements', () => {
      const emptyLabelRPY = `label first:
label second:
label third:
`;
      const labels = extractLabels(emptyLabelRPY);

      expect(labels).toEqual(['first', 'second', 'third']);
    });

    it('should handle labels with parameters', () => {
      const paramLabelRPY = `label first(param1, param2):
    pass
`;
      const labels = extractLabels(paramLabelRPY);

      expect(labels).toEqual(['first']);
    });

    it('should be case-sensitive', () => {
      const caseLabelRPY = `label Start:
label start:
label START:
`;
      const labels = extractLabels(caseLabelRPY);

      expect(labels).toEqual(['Start', 'start', 'START']);
    });

    it('should ignore labels inside strings', () => {
      const stringLabelRPY = `label start:
    "This is not a label: label fake"
    label real:
    return
`;
      const labels = extractLabels(stringLabelRPY);

      expect(labels).toEqual(['start', 'real']);
    });
  });

  describe('extractDialogue', () => {
    it('should extract dialogue with speaker', () => {
      const dialogue = extractDialogue(sampleRPY);

      expect(dialogue).toEqual([
        { speaker: null, text: 'Hello, world!' },
        { speaker: 's', text: 'Welcome to BranchForge!' },
        { speaker: 's', text: 'This is chapter 1.' },
        { speaker: 's', text: 'You chose route A.' },
        { speaker: 's', text: 'You chose route B.' },
      ]);
    });

    it('should extract dialogue without speaker (narration)', () => {
      const dialogue = extractDialogue(sampleRPY);

      // Find the "Hello, world!" line which has no speaker
      const helloWorld = dialogue.find(d => d.text === 'Hello, world!');
      expect(helloWorld).toBeDefined();
      expect(helloWorld?.speaker).toBeNull();
    });

    it('should preserve whitespace in dialogue', () => {
      const whitespaceRPY = `label start:
    s "Hello  there!  How are you?"
    return
`;
      const dialogue = extractDialogue(whitespaceRPY);

      expect(dialogue[0].text).toBe('Hello  there!  How are you?');
    });

    it('should handle empty dialogue strings', () => {
      const emptyDialogueRPY = `label start:
    s ""
    return
`;
      const dialogue = extractDialogue(emptyDialogueRPY);

      expect(dialogue).toHaveLength(1);
      expect(dialogue[0].text).toBe('');
    });

    it('should handle dialogue with quotes inside', () => {
      const quotedDialogueRPY = `label start:
    s 'She said "Hello" to me'
    return
`;
      const dialogue = extractDialogue(quotedDialogueRPY);

      expect(dialogue[0].text).toBe('She said "Hello" to me');
    });

    it('should handle triple-quoted dialogue', () => {
      const tripleQuotedRPY = `label start:
    s """
    This is a long
    multiline dialogue
    """
    return
`;
      const dialogue = extractDialogue(tripleQuotedRPY);

      expect(dialogue[0].text).toContain('multiline dialogue');
    });
  });

  describe('extractChoices', () => {
    it('should extract menu choices', () => {
      const choices = extractChoices(sampleRPY);

      expect(choices).toEqual([
        { label: 'Choice 1', target: 'route_a', parentLabel: 'chapter1' },
        { label: 'Choice 2', target: 'route_b', parentLabel: 'chapter1' },
      ]);
    });

    it('should handle choices without jumps', () => {
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
      expect(choices[0].label).toBe('Just text');
    });

    it('should handle nested menus', () => {
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
      expect(choices[0].label).toBe('First level');
      expect(choices[1].label).toBe('Second level');
    });

    it('should handle choices with inline actions', () => {
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

    it('should handle choices with special characters', () => {
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

  describe('extractJumps', () => {
    it('should extract jump targets', () => {
      const jumps = extractJumps(sampleRPY);

      expect(jumps).toEqual([
        { from: 'start', to: 'chapter1' },
        { from: 'chapter1', to: 'route_a' },
        { from: 'chapter1', to: 'route_b' },
      ]);
    });

    it('should handle jumps with expressions', () => {
      const expressionJumpRPY = `label start:
    jump expression "chapter_" + str(1)
`;
      const jumps = extractJumps(expressionJumpRPY);

      expect(jumps).toHaveLength(1);
      expect(jumps[0].to).toContain('chapter_');
      expect(jumps[0].from).toBe('start');
    });

    it('should handle if statements', () => {
      const ifJumpRPY = `label start:
    if condition:
        jump route_a
    else:
        jump route_b
`;
      const jumps = extractJumps(ifJumpRPY);

      expect(jumps).toHaveLength(2);
      expect(jumps[0].to).toBe('route_a');
      expect(jumps[1].to).toBe('route_b');
    });

    it('should handle call statements (different from jump)', () => {
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
      const call = jumps.find(j => j.to === 'subroutine');
      const jump = jumps.find(j => j.to === 'next');
      expect(call).toBeDefined();
      expect(jump).toBeDefined();
      expect(call?.isCall).toBe(true);
      expect(jump?.isCall).toBeUndefined();
    });

    it('should handle return statements', () => {
      const returnRPY = `label start:
    "Hello"
    return
`;
      const jumps = extractJumps(returnRPY);

      expect(jumps).toHaveLength(1);
      expect(jumps[0].to).toBe('__return__');
      expect(jumps[0].from).toBe('start');
    });
  });

  describe('parseRPYFile', () => {
    it('should parse a complete RPY file structure', () => {
      const result = parseRPYFile(sampleRPY);

      expect(result).toMatchObject({
        labels: expect.any(Array),
        dialogue: expect.any(Array),
        choices: expect.any(Array),
        jumps: expect.any(Array),
      });
    });

    it('should maintain order of dialogue lines', () => {
      const result = parseRPYFile(sampleRPY);

      const dialogueOrder = result.dialogue.map(d => d.text);
      expect(dialogueOrder.indexOf('Hello, world!')).toBeLessThan(
        dialogueOrder.indexOf('This is chapter 1.')
      );
    });

    it('should track label hierarchy', () => {
      const result = parseRPYFile(sampleRPY);

      // Choices should have parentLabel information
      const chapter1Choices = result.choices.filter(c => c.parentLabel === 'chapter1');
      expect(chapter1Choices).toHaveLength(2);
    });

    it('should handle complex RPY with multiple features', () => {
      const result = parseRPYFile(complexRPY);

      expect(result.labels.length).toBeGreaterThan(0);
      expect(result.dialogue.length).toBeGreaterThan(0);
      expect(result.choices.length).toBeGreaterThan(0);
      expect(result.jumps.length).toBeGreaterThan(0);
    });
  });

  describe('convertToBranchForgeFormat', () => {
    it('should convert parsed RPY to BranchForge scene format', () => {
      const parsed = parseRPYFile(sampleRPY);
      const converted = convertToBranchForgeFormat(parsed, 'chapter1');

      expect(converted).toMatchObject({
        name: expect.any(String),
        entries: expect.any(Array),
      });
    });

    it('should map dialogue to scene lines', () => {
      const parsed = parseRPYFile(sampleRPY);
      const converted = convertToBranchForgeFormat(parsed, 'chapter1');

      expect(converted.entries.length).toBeGreaterThan(0);
    });

    it('should map choices to flags', () => {
      const parsed = parseRPYFile(sampleRPY);
      const converted = convertToBranchForgeFormat(parsed, 'chapter1');

      // Choices should create flag points
      expect(converted.entries.some(e => e.type === 'FLAG')).toBe(true);
    });

    it('should handle labels without corresponding scene', () => {
      const parsed = parseRPYFile(sampleRPY);
      const converted = convertToBranchForgeFormat(parsed, 'nonexistent');

      // Should return a valid structure even if label not found
      expect(converted).toBeDefined();
      expect(converted.entries).toEqual([]);
    });

    it('should preserve character information', () => {
      const parsed = parseRPYFile(complexRPY);
      const converted = convertToBranchForgeFormat(parsed, 'first_label');

      // Character definitions should be extracted
      expect(converted.characters).toEqual(expect.any(Array));
    });
  });

  describe('error handling', () => {
    it('should handle invalid RPY syntax gracefully', () => {
      const invalidRPY = `this is not valid rpy syntax [[[[]]]`;

      expect(() => parseRPYContent(invalidRPY)).not.toThrow();
      const result = parseRPYContent(invalidRPY);
      expect(result).toBeDefined();
    });

    it('should handle mixed indentation', () => {
      const mixedIndentRPY = `label start:
  "Two spaces"
    "Four spaces"
\t"Tab character"
`;
      expect(() => parseRPYContent(mixedIndentRPY)).not.toThrow();
    });

    it('should handle unicode characters', () => {
      const unicodeRPY = `label start:
    s "Hello 世界! 🌍"
    s "Café résumé naïve"
`;
      const result = parseRPYContent(unicodeRPY);

      expect(result.dialogue).toHaveLength(2);
      expect(result.dialogue[0].text).toContain('世界');
    });
  });

  describe('edge cases', () => {
    it('should handle labels with numbers', () => {
      const numberedLabelRPY = `label label1:
label label2:
label chapter_3:
`;
      const labels = extractLabels(numberedLabelRPY);

      expect(labels).toEqual(['label1', 'label2', 'chapter_3']);
    });

    it('should handle labels with underscores', () => {
      const underscoredLabelRPY = `label chapter_1_scene_2:
label _private_label:
`;
      const labels = extractLabels(underscoredLabelRPY);

      expect(labels).toEqual(['chapter_1_scene_2', '_private_label']);
    });

    it('should ignore python blocks', () => {
      const pythonBlockRPY = `init python:
    def my_function():
        pass

label start:
    "Hello"
    return
`;
      const result = parseRPYContent(pythonBlockRPY);

      // Python code shouldn't interfere with label extraction
      expect(result.labels).toContain('start');
    });

    it('should handle screen statements', () => {
      const screenRPY = `screen my_screen():
    text "Hello"

label start:
    "World"
    return
`;
      const result = parseRPYContent(screenRPY);

      expect(result.labels).toContain('start');
    });
  });
});
