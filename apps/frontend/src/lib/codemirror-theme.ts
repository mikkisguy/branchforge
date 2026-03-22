import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";

/**
 * CodeMirror theme that integrates with BranchForge's CSS custom properties
 * Automatically adapts to the site's theme (forest, periwinkle, dark-amethyst, graphite)
 */
export const branchforgeTheme = EditorView.theme({
  "&": {
    backgroundColor: "hsl(var(--background)) !important",
    color: "hsl(var(--foreground))",
    fontSize: "14px",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "8px 0",
    minHeight: "100%",
  },
  ".cm-line": {
    padding: "0 8px",
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

/**
 * Syntax highlighting styles using the site's color scheme
 * Uses HighlightStyle from @codemirror/language for proper type safety
 */
const branchforgeHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-color)" },
  { tag: tags.operator, color: "var(--syntax-color)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.variableName, color: "var(--foreground)" },
  { tag: tags.tagName, color: "var(--syntax-tag)" },
  { tag: tags.attributeName, color: "var(--syntax-attribute)" },
  { tag: tags.propertyName, color: "var(--syntax-property)" },
]);

/**
 * Export as a proper CodeMirror extension
 */
export const branchforgeSyntaxHighlighting = syntaxHighlighting(
  branchforgeHighlightStyle
);
