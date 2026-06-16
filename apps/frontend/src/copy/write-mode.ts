/**
 * Write Mode strings (distraction-free dialogue editor).
 *
 * Technical badges (conditions, stats, variables) are display-only here.
 * Editing those happens in Script Mode.
 */
export const WRITE_MODE_COPY = {
  empty: {
    title: "No labels yet",
    description: "Import an RPY file to start writing.",
  },
  toolbar: {
    undo: "Undo",
    redo: "Redo",
    autosave: "Autosave",
    focusMode: "Focus mode",
  },
  line: {
    dialoguePlaceholder: "Type dialogue…",
    narrationPlaceholder: "Type narration…",
    addLine: "Add line",
    deleteLine: "Delete line",
  },
  badges: {
    conditionsTitle: "Conditions",
    conditionsTooltip: "Display only — edit in Script Mode",
    statCondition: (stat: string, op: string, value: string) =>
      `${stat} ${op} ${value}`,
    variableCondition: (variable: string) => `${variable}`,
  },
} as const;
