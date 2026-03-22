import { StreamLanguage } from "@codemirror/language";

/**
 * Ren'Py specific keywords
 */
const RENPY_KEYWORDS = new Set([
  'label', 'menu', 'jump', 'return', 'call', 'show', 'hide',
  'play', 'stop', 'scene', 'with', 'expression', 'init',
  'default', 'define', 'image', 'transform', 'screen',
  'window', 'text', 'button', 'input', 'pass', 'python',
  'pause', 'queue',
]);

/**
 * Python built-in keywords to also highlight
 */
const PYTHON_KEYWORDS = new Set([
  'if', 'else', 'elif', 'for', 'while', 'def', 'class',
  'return', 'yield', 'import', 'from', 'as', 'try', 'except',
  'finally', 'with', 'lambda', 'True', 'False', 'None',
  'and', 'or', 'not', 'in', 'is', 'assert', 'break',
  'continue', 'pass', 'raise', 'global', 'nonlocal', 'async',
  'await',
]);

interface RenPyState {
  inString: '"' | "'" | null;
}

function isWordChar(character: string | undefined): boolean {
  return !!character && /[\w\u0080-\uffff]/.test(character);
}

function consumeQuotedString(
  stream: { next: () => string | void; eol: () => boolean },
  quote: '"' | "'",
  hasOpeningQuote: boolean = true
): boolean {
  // Consume the opening quote first, if present.
  if (hasOpeningQuote) {
    stream.next();
  }

  let escaped = false;
  while (!stream.eol()) {
    const character = stream.next();
    if (character === undefined) {
      break;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === quote) {
      return true;
    }
  }

  return false;
}

/**
 * Ren'Py language definition for CodeMirror using StreamLanguage
 * Handles Ren'Py keywords first, then falls back to Python-like syntax
 */
export const renpyLanguage = StreamLanguage.define<RenPyState>({
  name: 'renpy',

  startState(): RenPyState {
    return { inString: null };
  },

  token(stream, state): string | null {
    // Handle whitespace
    if (stream.eatSpace()) {
      return null;
    }

    // Handle comments
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'lineComment';
    }

    // If inside string, consume until the matching quote is found.
    if (state.inString) {
      const closed = consumeQuotedString(stream, state.inString, false);
      if (closed) {
        state.inString = null;
      }
      return 'string';
    }

    // Handle strings (both single and double quote)
    const quote = stream.peek();
    if (quote === '"' || quote === "'") {
      const previousCharacter = stream.pos > 0 ? stream.string.charAt(stream.pos - 1) : '';
      const nextCharacter = stream.string.charAt(stream.pos + 1);

      // Treat apostrophes inside words as punctuation instead of string delimiters.
      if (quote === "'" && isWordChar(previousCharacter) && isWordChar(nextCharacter)) {
        stream.next();
        return null;
      }

      const closed = consumeQuotedString(stream, quote);
      if (!closed) {
        state.inString = quote;
      }
      return 'string';
    }

    // Handle numbers (must come before word check since \w includes digits)
    // Matches: integers, floats, decimals starting with dot, optional exponent
    if (stream.match(/[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/)) {
      return 'number';
    }

    // Handle words (keywords or identifiers)
    const wordMatch = stream.match(/[\w\u0080-\uffff]+/);
    if (wordMatch) {
      const current = stream.current();
      if (RENPY_KEYWORDS.has(current) || PYTHON_KEYWORDS.has(current)) {
        return 'keyword';
      }
      return 'variableName';
    }

    // Handle operators (dot removed - now part of float number matching)
    if (stream.match(/[=+*/%&|<>!,^~@-]+/)) {
      return 'operator';
    }

    // Handle brackets as property
    if (stream.match(/[()[\]{}]/)) {
      return 'brace';
    }

    // Handle colon
    if (stream.match(':')) {
      return 'operator';
    }

    // Consume next character
    stream.next();
    return null;
  },

  copyState(state: RenPyState): RenPyState {
    return { inString: state.inString };
  },
});

/**
 * Extension function to use the Ren'Py language in CodeMirror
 */
export function renpy() {
  return renpyLanguage;
}
