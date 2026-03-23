import { StreamLanguage, type StringStream } from "@codemirror/language";
import { tags, Tag } from "@lezer/highlight";

/**
 * Ren'Py keywords for syntax highlighting
 */
const KEYWORDS = new Set([
  "label",
  "define",
  "default",
  "init",
  "screen",
  "show",
  "scene",
  "hide",
  "play",
  "stop",
  "queue",
  "call",
  "jump",
  "return",
  "menu",
  "if",
  "elif",
  "else",
  "while",
  "for",
  "python",
  "image",
  "transform",
  "pause",
  "with",
  "at",
  "as",
  "behind",
  "onlayer",
  "zorder",
  "expression",
  "pass",
  "from",
  "translate",
  "layeredimage",
  "group",
  "always",
  "attribute",
  "camera",
  "window",
  "set",
  "in",
  "style",
]);

/**
 * Python literals in Ren'Py
 */
const LITERALS = new Set(["True", "False", "None"]);

/**
 * Built-in labels in Ren'Py
 */
const BUILTIN_LABELS = new Set([
  "start",
  "quit",
  "after_load",
  "splashscreen",
  "before_main_menu",
  "main_menu",
  "after_warp",
  "hide_windows",
]);

/**
 * Built-in audio channels in Ren'Py
 */
const AUDIO_CHANNELS = new Set([
  "music",
  "sound",
  "voice",
  "audio",
  "ambiance",
]);

/**
 * Audio-specific keywords
 */
const AUDIO_KEYWORDS = new Set([
  "fadeout",
  "fadein",
  "volume",
  "loop",
  "noloop",
]);

/**
 * Ren'Py configuration/namespace keywords
 * Special objects like gui, config, preferences that access global settings
 */
const CONFIG_KEYWORDS = new Set(["gui", "config", "preferences"]);

/**
 * Custom tag for Ren'Py configuration keywords (gui, config, preferences)
 */
export const configKeywordTag = Tag.define();

/**
 * Custom tag for Ren'Py audio keywords (fadeout, fadein, volume, loop, noloop)
 */
export const audioKeywordTag = Tag.define();

/**
 * Ren'Py tokenizer for CodeMirror StreamLanguage
 * Returns Lezer tag names for proper syntax highlighting
 */
function renPyTokenizer(stream: StringStream): string | null {
  // Handle comments first
  if (stream.eatSpace()) {
    return null;
  }

  // Comments: # to end of line
  if (stream.match("#", false)) {
    stream.skipToEnd();
    return "lineComment";
  }

  // Python one-line statements: $ python code
  if (stream.match("$")) {
    // After $, the rest of the line is Python code
    stream.skipToEnd();
    return "keyword";
  }

  // Strings: triple-quoted first
  if (stream.match('"""')) {
    while (!stream.eol()) {
      if (stream.match('"""')) {
        break;
      }
      stream.next();
    }
    return "string";
  }

  if (stream.match("'''")) {
    while (!stream.eol()) {
      if (stream.match("'''")) {
        break;
      }
      stream.next();
    }
    return "string";
  }

  // Double-quoted strings
  if (stream.match('"')) {
    let escaped = false;
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === '"' && !escaped) break;
      escaped = ch === "\\" && !escaped;
    }
    return "string";
  }

  // Single-quoted strings
  if (stream.match("'")) {
    let escaped = false;
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === "'" && !escaped) break;
      escaped = ch === "\\" && !escaped;
    }
    return "string";
  }

  // Numbers: floats first (with scientific notation)
  if (stream.match(/^[+-]?\d+\.\d+([eE][+-]?\d+)?/)) {
    return "number";
  }

  // Numbers: integers
  if (stream.match(/^[+-]?\d+/)) {
    return "number";
  }

  // Built-in labels (when used as a standalone word)
  if (stream.match(/^[a-zA-Z_]\w*/)) {
    const word = stream.current();

    // Check for config/namespace keywords first (highest priority)
    if (CONFIG_KEYWORDS.has(word)) {
      return "configKeyword";
    }

    // Check for audio channels
    if (AUDIO_CHANNELS.has(word)) {
      return "atom"; // Use atom for types/builtins
    }

    // Check for audio-specific keywords
    if (AUDIO_KEYWORDS.has(word)) {
      return "audioKeyword";
    }

    // Check for built-in labels
    if (BUILTIN_LABELS.has(word)) {
      return "variableName";
    }

    // Check for Python literals
    if (LITERALS.has(word)) {
      return "atom";
    }

    // Check for keywords
    if (KEYWORDS.has(word)) {
      return "keyword";
    }

    // Everything else is a variable/identifier
    return "variableName";
  }

  // Punctuation and operators
  if (stream.eat("=")) {
    return "operator";
  }

  if (stream.eat(":")) {
    return "punctuation";
  }

  if (
    stream.eat("(") ||
    stream.eat(")") ||
    stream.eat("[") ||
    stream.eat("]") ||
    stream.eat("{") ||
    stream.eat("}")
  ) {
    return "punctuation";
  }

  if (stream.eat(",") || stream.eat(";")) {
    return "punctuation";
  }

  if (stream.eat(".") && !stream.match(/^\./, false)) {
    return "punctuation";
  }

  if (stream.match(/^[+\-*/%<>!&|^~=]/)) {
    return "operator";
  }

  // Say statement patterns: "text" or character.name "text"
  // This is handled by the string matching above

  // Default: skip one character
  stream.next();
  return null;
}

/**
 * Ren'Py language definition for CodeMirror
 * Uses tokenTable to map custom token types to Lezer tags
 */
export const renPy = StreamLanguage.define({
  name: "renpy",
  token(stream: StringStream) {
    return renPyTokenizer(stream);
  },
  // Map token types to Lezer tags for proper highlighting
  tokenTable: {
    lineComment: tags.lineComment,
    string: tags.string,
    keyword: tags.keyword,
    number: tags.number,
    variableName: tags.variableName,
    atom: tags.atom,
    propertyName: tags.propertyName,
    operator: tags.operator,
    punctuation: tags.punctuation,
    configKeyword: configKeywordTag,
    audioKeyword: audioKeywordTag,
  },
  languageData: {
    commentTokens: { line: "#" },
    indentOnInput: /^\s*(:)$/,
  },
});
