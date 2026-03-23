import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { configKeywordTag, audioKeywordTag } from "./renpy";

/**
 * Ren'Py syntax highlighting styles using the site's color scheme
 * Uses HighlightStyle from @codemirror/language for proper type safety
 */
export const renPyHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--keyword)" },
  { tag: configKeywordTag, color: "var(--config-keyword)" },
  { tag: audioKeywordTag, color: "var(--audio-keyword)" },
  { tag: tags.operator, color: "var(--operator)" },
  { tag: tags.string, color: "var(--string)" },
  { tag: tags.number, color: "var(--number)" },
  { tag: tags.lineComment, color: "var(--comment)", fontStyle: "italic" },
  { tag: tags.blockComment, color: "var(--comment)", fontStyle: "italic" },
  { tag: tags.variableName, color: "var(--variable)" },
  { tag: tags.atom, color: "var(--atom)" },
  { tag: tags.propertyName, color: "var(--property)" },
  { tag: tags.punctuation, color: "var(--punctuation)" },
]);

/**
 * Export as a proper CodeMirror extension
 */
export const renPySyntaxHighlighting = syntaxHighlighting(renPyHighlightStyle);

/**
 * Base editor theme for Ren'Py script editor
 */
export const renPyBaseTheme = EditorView.theme({
  "&": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  },
  ".cm-editor": {
    height: "100%",
    width: "100%",
    maxWidth: "100%",
    fontSize: "var(--editor-font-size, 14px)",
    fontFamily: "'Fira Code', monospace",
    backgroundColor: "hsl(var(--background))",
  },
  ".cm-scroller": {
    overflowX: "auto",
    overflowY: "auto",
    backgroundColor: "hsl(var(--background))",
  },
  ".cm-content": {
    fontFamily: "'Fira Code', monospace",
    backgroundColor: "hsl(var(--background))",
  },
  ".cm-line": {
    fontFamily: "'Fira Code', monospace",
  },
  // Line numbers
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "hsl(var(--muted-foreground) / 0.4)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 4px 0 8px",
    minWidth: "24px",
    textAlign: "right",
  },
  // Active line highlight
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--muted) / 0.3)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "hsl(var(--foreground))",
  },
  // Selection
  ".cm-selectionBackground": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.75) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.9) !important",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.9) !important",
  },
  ".cm-content ::selection": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.75) !important",
  },
  // Cursor
  ".cm-cursor": {
    borderLeftColor: "hsl(var(--theme-color))",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "hsl(var(--theme-color))",
  },
  // Matching brackets
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.2)",
    color: "hsl(var(--foreground))",
  },
  // Search match
  ".cm-searchMatch": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.3)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(var(--theme-color-rgb), 0.4)",
  },
  // Panel (e.g., search panel)
  ".cm-panel": {
    backgroundColor: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    border: "1px solid hsl(var(--border))",
  },
  ".cm-panel.cm-search": {
    padding: "4px 8px",
  },
  // Tooltip
  ".cm-tooltip": {
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    border: "1px solid hsl(var(--border))",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul": {
      backgroundColor: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      maxHeight: "200px",
    },
    "& > ul > li": {
      padding: "2px 8px",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--accent-foreground))",
    },
  },
});
