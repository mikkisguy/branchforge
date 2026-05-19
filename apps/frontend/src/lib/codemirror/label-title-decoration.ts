/**
 * Label Title Decoration Extension for CodeMirror
 *
 * Displays the human-readable label title as a virtual "comment" line
 * above each `label labelName:` declaration in Script Mode.
 *
 * The title comes from the database (not the file), so this decoration
 * has zero impact on the RPY file content, positions, hashes, or sync.
 *
 * Architecture: Uses a StateField to hold the title map, updated via
 * StateEffect. A separate StateField computes decorations by scanning
 * the document for label declarations and looking up titles.
 * This matches the proven pattern used by the target-line highlight.
 */

import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { RENPY_LABEL_REGEX } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

/**
 * Map of labelName → title for decorating label declarations.
 * Only labels present in this map get a title decoration.
 */
export type LabelTitleMap = Map<string, string>;

/**
 * Effect to update the label title map reactively from React state.
 */
export const setLabelTitlesEffect = StateEffect.define<LabelTitleMap>();

// ============================================================================
// Widget
// ============================================================================

class LabelTitleWidget extends WidgetType {
  constructor(readonly title: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-label-title-decoration";
    span.textContent = this.title;
    return span;
  }

  eq(other: LabelTitleWidget): boolean {
    return this.title === other.title;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ============================================================================
// State Field — holds the current title map
// ============================================================================

const labelTitlesField = StateField.define<LabelTitleMap>({
  create: () => new Map(),
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setLabelTitlesEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// ============================================================================
// State Field — computes decorations from doc + title map
// ============================================================================

function buildDecorations(state: EditorState): DecorationSet {
  const titles = state.field(labelTitlesField);
  if (!titles || titles.size === 0) return Decoration.none;

  const widgets: ReturnType<Decoration["range"]>[] = [];

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const match = line.text.match(RENPY_LABEL_REGEX);
    if (match) {
      const labelName = match[1];
      const title = titles.get(labelName);
      if (title) {
        const widget = Decoration.widget({
          widget: new LabelTitleWidget(title),
          side: -1,
        });
        widgets.push(widget.range(line.to, line.to));
      }
    }
  }

  return Decoration.set(widgets, true);
}

const labelTitleDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, transaction) {
    const titlesChanged =
      transaction.state.field(labelTitlesField) !==
      transaction.startState.field(labelTitlesField);
    if (transaction.docChanged || titlesChanged) {
      return buildDecorations(transaction.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns the CodeMirror extensions needed for label title decorations.
 *
 * Usage:
 * 1. Add `labelTitleExtension` to the editor's extensions array
 * 2. Dispatch `setLabelTitlesEffect` with a `Map<string, string>` to update titles
 */
export const labelTitleExtension = [labelTitlesField, labelTitleDecorations];
