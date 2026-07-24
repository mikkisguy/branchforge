// ScriptEditor is lazy-loaded; keep static imports so highlight state can
// share the same CodeMirror chunk instead of a separate dynamic import.
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { StateField, StateEffect } from "@codemirror/state";

export const TARGET_LINE_HIGHLIGHT_MS = 920;
export const TARGET_LINE_HIGHLIGHT_CLEANUP_BUFFER_MS = 90;
export const TARGET_LINE_HIGHLIGHT_DEDUPE_WINDOW_MS = 180;

export const createHighlightExtension = () => {
  // Define the state effect for setting the highlighted line
  const setHighlightEffect = StateEffect.define<number | null>();

  // Create the StateField to manage the highlighted line
  const highlightStateField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (decorations, transaction) => {
      // Check if there's a setHighlightEffect in the transaction
      for (const effect of transaction.effects) {
        if (effect.is(setHighlightEffect)) {
          const line = effect.value;
          if (line === null) {
            return Decoration.none;
          }
          try {
            const lineObj = transaction.state.doc.line(line);
            const decoration = Decoration.line({
              class: "cm-target-line-highlight",
            });
            return Decoration.set([decoration.range(lineObj.from)]);
          } catch {
            return Decoration.none;
          }
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return { highlightStateField, setHighlightEffect };
};
