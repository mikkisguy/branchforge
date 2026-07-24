import type {
  DetectedCharacter,
  CharacterConflict,
  CharacterNameType,
} from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface EditableCharacter extends DetectedCharacter {
  excluded: boolean;
  isLoveInterest?: boolean;
  isNarrator?: boolean;
  routeAffiliation?: string;
}

export interface CharacterGroup {
  new: EditableCharacter[];
  existing: CharacterConflict[];
  special: EditableCharacter[];
}

export interface WizardState {
  groups: CharacterGroup;
  linkToLines: boolean;
  expandedGroups: Set<keyof CharacterGroup>;
  isImporting: boolean;
  showAddForm: boolean;
  newCharacter: { tag: string; displayName: string; color: string };
}

export type WizardAction =
  | {
      type: "UPDATE_CHARACTER";
      group: keyof CharacterGroup;
      index: number;
      updates: Partial<EditableCharacter>;
    }
  | { type: "ADD_CHARACTER"; character: EditableCharacter }
  | { type: "SET_LINK_TO_LINES"; value: boolean }
  | { type: "TOGGLE_GROUP"; group: keyof CharacterGroup }
  | { type: "SET_IMPORTING"; value: boolean }
  | { type: "SET_SHOW_ADD_FORM"; value: boolean }
  | {
      type: "UPDATE_NEW_CHARACTER";
      updates: Partial<{ tag: string; displayName: string; color: string }>;
    }
  | { type: "RESET_NEW_CHARACTER" };

// ============================================================================
// Helper Functions
// ============================================================================

export function groupCharacters(
  detected: DetectedCharacter[],
  conflicts: CharacterConflict[],
  excludedTags: string[],
  narratorTags: string[]
): CharacterGroup {
  const conflictTags = new Set(conflicts.map((c) => c.tag));
  const specialTags = new Set(["n", "u", "narrator", "extend"]);
  const excludedTagSet = new Set(excludedTags);
  const narratorTagSet = new Set(narratorTags);
  const conflictMap = new Map(conflicts.map((c) => [c.tag, c]));

  const result: CharacterGroup = {
    new: [],
    existing: [],
    special: [],
  };

  for (const char of detected) {
    const isConflict = conflictTags.has(char.tag);
    const isSpecial = char.isSpecial || specialTags.has(char.tag);

    const editable: EditableCharacter = {
      ...char,
      excluded: excludedTagSet.has(char.tag) || (isSpecial && !isConflict),
      isLoveInterest: false,
      isNarrator: narratorTagSet.has(char.tag),
      routeAffiliation: undefined,
    };

    if (isConflict) {
      const conflict = conflictMap.get(char.tag);
      if (conflict) {
        result.existing.push(conflict);
      }
    } else if (isSpecial) {
      result.special.push(editable);
    } else {
      result.new.push(editable);
    }
  }

  return result;
}

export function randomColor(): string {
  return (
    "#" +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")
  );
}

/**
 * User-facing label + helper text for a CharacterNameType.
 * Drives the warning badge and helper text below the display name field
 * in the import wizard. `null` means no badge is shown.
 */
export interface NameTypeBadgeInfo {
  label: string;
  helper: string;
}

export function getNameTypeBadge(
  nameType: CharacterNameType
): NameTypeBadgeInfo | null {
  switch (nameType) {
    case "variable":
      return {
        label: "Variable name",
        helper:
          "The source references a variable whose value is only known at runtime. Enter a placeholder display name for use in BranchForge; export will keep the variable reference.",
      };
    case "interpolated":
      return {
        label: "Interpolated name",
        helper:
          "The source uses Ren'Py interpolation (e.g. [var]). The displayed name will vary at runtime. You can override it for BranchForge; export keeps the original.",
      };
    case "tagged":
      return {
        label: "Formatting stripped",
        helper:
          "Ren'Py inline tags (e.g. {color}, {b}) were stripped from the display name. The raw form is preserved for export.",
      };
    case "empty":
      return {
        label: "Empty name",
        helper:
          "The source has an empty display name. Enter a display name to use in BranchForge.",
      };
    case "unknown":
      return {
        label: "Unknown speaker",
        helper: 'The source uses "???" — typically intentional. Kept as-is.',
      };
    case "none":
    case "literal":
    default:
      return null;
  }
}

export function createInitialWizardState(
  detectedCharacters: DetectedCharacter[],
  conflicts: CharacterConflict[],
  excludedTags: string[],
  narratorTags: string[]
): WizardState {
  return {
    groups: groupCharacters(
      detectedCharacters,
      conflicts,
      excludedTags,
      narratorTags
    ),
    linkToLines: true,
    expandedGroups: new Set(["new", "existing", "special"]),
    isImporting: false,
    showAddForm: false,
    newCharacter: { tag: "", displayName: "", color: randomColor() },
  };
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case "UPDATE_CHARACTER":
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.group]: state.groups[action.group].map(
            (char: EditableCharacter | CharacterConflict, i: number) =>
              i === action.index ? { ...char, ...action.updates } : char
          ),
        },
      };
    case "ADD_CHARACTER":
      return {
        ...state,
        groups: {
          ...state.groups,
          new: [...state.groups.new, action.character],
        },
        newCharacter: { tag: "", displayName: "", color: randomColor() },
        showAddForm: false,
      };
    case "SET_LINK_TO_LINES":
      return { ...state, linkToLines: action.value };
    case "TOGGLE_GROUP": {
      const next = new Set(state.expandedGroups);
      if (next.has(action.group)) {
        next.delete(action.group);
      } else {
        next.add(action.group);
      }
      return { ...state, expandedGroups: next };
    }
    case "SET_IMPORTING":
      return { ...state, isImporting: action.value };
    case "SET_SHOW_ADD_FORM":
      return { ...state, showAddForm: action.value };
    case "UPDATE_NEW_CHARACTER":
      return {
        ...state,
        newCharacter: { ...state.newCharacter, ...action.updates },
      };
    case "RESET_NEW_CHARACTER":
      return {
        ...state,
        newCharacter: { tag: "", displayName: "", color: randomColor() },
      };
    default:
      return state;
  }
}
