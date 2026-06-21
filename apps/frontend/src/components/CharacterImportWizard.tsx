/**
 * Character Import Wizard
 *
 * Dialog for reviewing and approving detected characters from RPY files.
 * Shows new characters, existing characters with conflicts, and special characters.
 */

import { useReducer, useCallback, useId } from "react";
import {
  X,
  User,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Ban,
  Settings,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { charactersApi, type ImportCharacter } from "@/lib/api/characters";
import type {
  DetectedCharacter,
  CharacterConflict,
  CharacterNameType,
} from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";
import { useQueryClient } from "@tanstack/react-query";
import { labelKeys, characterKeys } from "@/lib/query-keys";

// ============================================================================
// Types
// ============================================================================

export interface CharacterImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  detectedCharacters: DetectedCharacter[];
  conflicts: CharacterConflict[];
  excludedTags: string[];
  onComplete?: () => void;
}

interface EditableCharacter extends DetectedCharacter {
  excluded: boolean;
  isLoveInterest?: boolean;
  routeAffiliation?: string;
}

interface CharacterGroup {
  new: EditableCharacter[];
  existing: CharacterConflict[];
  special: EditableCharacter[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function groupCharacters(
  detected: DetectedCharacter[],
  conflicts: CharacterConflict[],
  excludedTags: string[]
): CharacterGroup {
  const conflictTags = new Set(conflicts.map((c) => c.tag));
  const specialTags = new Set(["n", "u", "narrator", "extend"]);
  const excludedTagSet = new Set(excludedTags);
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
      routeAffiliation: undefined,
    };

    if (isConflict) {
      // Find the conflict info
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

interface WizardState {
  groups: CharacterGroup;
  linkToLines: boolean;
  expandedGroups: Set<keyof CharacterGroup>;
  isImporting: boolean;
  showAddForm: boolean;
  newCharacter: { tag: string; displayName: string; color: string };
}

type WizardAction =
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

function randomColor(): string {
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
interface NameTypeBadgeInfo {
  label: string;
  helper: string;
}

function getNameTypeBadge(
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

function createInitialWizardState(
  detectedCharacters: DetectedCharacter[],
  conflicts: CharacterConflict[],
  excludedTags: string[]
): WizardState {
  return {
    groups: groupCharacters(detectedCharacters, conflicts, excludedTags),
    linkToLines: true,
    expandedGroups: new Set(["new", "existing", "special"]),
    isImporting: false,
    showAddForm: false,
    newCharacter: { tag: "", displayName: "", color: randomColor() },
  };
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "UPDATE_CHARACTER":
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.group]: state.groups[action.group].map((char, i) =>
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

// ============================================================================
// Component
// ============================================================================

export function CharacterImportWizard({
  open,
  onOpenChange,
  projectId,
  detectedCharacters,
  conflicts,
  excludedTags,
  onComplete,
}: CharacterImportWizardProps) {
  // Generate unique ID for checkbox to prevent collisions when multiple wizards are mounted
  const linkToLinesId = useId();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(
    wizardReducer,
    { detectedCharacters, conflicts, excludedTags },
    ({ detectedCharacters: dc, conflicts: c, excludedTags: et }) =>
      createInitialWizardState(dc, c, et)
  );

  /**
   * Toggle group expansion
   */
  const toggleGroup = useCallback((group: keyof CharacterGroup) => {
    dispatch({ type: "TOGGLE_GROUP", group });
  }, []);

  /**
   * Update character property
   */
  const updateCharacter = useCallback(
    (
      group: keyof CharacterGroup,
      index: number,
      updates: Partial<EditableCharacter>
    ) => {
      dispatch({ type: "UPDATE_CHARACTER", group, index, updates });
    },
    []
  );

  /**
   * Import characters
   */
  const handleImport = useCallback(async () => {
    dispatch({ type: "SET_IMPORTING", value: true });

    try {
      // Collect all non-excluded characters
      const charactersToImport = [
        ...state.groups.new.filter((c) => !c.excluded),
      ];

      const excludedTagSet = new Set(excludedTags);
      for (const c of state.groups.existing) {
        if (!excludedTagSet.has(c.tag)) {
          charactersToImport.push({
            tag: c.tag,
            name: c.detectedName,
            displayName: c.detectedName || c.tag,
            color: c.detectedColor,
            isSpecial: false,
            sourceFile: "",
            confidence: 1,
            nameType: "literal",
            isLoveInterest: false,
            routeAffiliation: undefined,
            excluded: false,
          });
        }
      }

      charactersToImport.push(
        ...state.groups.special.filter((c) => !c.excluded)
      );

      // Map to import format
      const importData: ImportCharacter[] = charactersToImport.map((c) => ({
        tag: c.tag,
        name: c.name ?? c.tag,
        displayName: c.displayName,
        color: c.color,
        isLoveInterest: c.isLoveInterest ?? false,
        routeAffiliation: c.routeAffiliation,
      }));

      const newExcludedTags = [...excludedTags];

      for (const c of state.groups.new) {
        if (c.excluded) {
          newExcludedTags.push(c.tag);
        }
      }

      for (const c of state.groups.special) {
        if (c.excluded) {
          newExcludedTags.push(c.tag);
        }
      }

      const result = await charactersApi.importCharacters(projectId, {
        characters: importData,
        excludedTags: newExcludedTags,
        linkToLines: state.linkToLines,
      });

      success(`Imported ${result.characters.length} character(s)`);

      if (result.unmatched.length > 0) {
        error(`${result.unmatched.length} speaker(s) could not be matched`);
      }

      // Invalidate label queries to refresh speaker information
      // This ensures the UI shows the newly linked speakers instead of null
      // Also invalidate characters query to show the newly imported characters
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: labelKeys.scoped(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: characterKeys.lists(projectId),
        }),
      ]);

      // Close dialog after short delay
      setTimeout(() => {
        onOpenChange(false);
        onComplete?.();
      }, 500);
    } catch (err) {
      error(err instanceof Error ? err.message : "Import failed");
    } finally {
      dispatch({ type: "SET_IMPORTING", value: false });
    }
  }, [
    state,
    excludedTags,
    projectId,
    onOpenChange,
    onComplete,
    success,
    error,
    queryClient,
  ]);

  /**
   * Close handler
   */
  const handleClose = useCallback(() => {
    if (!state.isImporting) {
      onOpenChange(false);
    }
  }, [state.isImporting, onOpenChange]);

  /**
   * Add a new character manually
   */
  const addCharacter = useCallback(() => {
    const tag = state.newCharacter.tag.trim();
    if (!tag) {
      return;
    }

    // Check for duplicates across all character groups (case-insensitive)
    const allTags = [
      ...state.groups.new.map((c) => c.tag.toLowerCase()),
      ...state.groups.existing.map((c) => c.tag.toLowerCase()),
      ...state.groups.special.map((c) => c.tag.toLowerCase()),
    ];
    if (allTags.includes(tag.toLowerCase())) {
      return;
    }

    const character: EditableCharacter = {
      tag,
      name: state.newCharacter.displayName || tag,
      displayName: state.newCharacter.displayName || tag,
      color: state.newCharacter.color,
      isSpecial: false,
      sourceFile: "manual",
      confidence: 1,
      nameType: "literal",
      excluded: false,
    };

    dispatch({ type: "ADD_CHARACTER", character });
  }, [state.newCharacter, state.groups]);

  // Count totals
  const newCount = state.groups.new.length;
  const existingCount = state.groups.existing.length;
  const specialCount = state.groups.special.length;
  const excludedTagSet = new Set(excludedTags);
  const selectedCount =
    state.groups.new.filter((c) => !c.excluded).length +
    state.groups.existing.filter((c) => !excludedTagSet.has(c.tag)).length +
    state.groups.special.filter((c) => !c.excluded).length;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent className="max-w-2xl w-full p-0 gap-0 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-md">
              <User className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-medium">Import Characters</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {detectedCharacters.length > 0
                  ? `Review and approve ${detectedCharacters.length} detected character(s)`
                  : newCount > 0
                    ? `${newCount} character(s) added manually`
                    : "No characters detected - add them manually"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={state.isImporting}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* No characters detected - show add button */}
          {newCount === 0 && existingCount === 0 && specialCount === 0 && (
            <div className="text-center p-6 border border-dashed border-border/50 rounded-md">
              <p className="text-sm text-muted-foreground mb-3">
                No characters were detected from your RPY files
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Your RPY files may use custom character definition patterns. You
                can add characters manually.
              </p>
              {!state.showAddForm ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    dispatch({ type: "SET_SHOW_ADD_FORM", value: true })
                  }
                  disabled={state.isImporting}
                >
                  <Plus className="size-4 mr-2" />
                  Add Character
                </Button>
              ) : (
                <div className="text-left space-y-3 max-w-sm mx-auto">
                  <div>
                    <Label className="text-xs">Character Tag</Label>
                    <Input
                      placeholder="e.g., s, narrator, protagonist"
                      value={state.newCharacter.tag}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_NEW_CHARACTER",
                          updates: { tag: e.target.value },
                        })
                      }
                      disabled={state.isImporting}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      placeholder="e.g., Sarah, Narrator"
                      value={state.newCharacter.displayName}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_NEW_CHARACTER",
                          updates: { displayName: e.target.value },
                        })
                      }
                      disabled={state.isImporting}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Color</Label>
                      <Input
                        type="color"
                        value={state.newCharacter.color}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_NEW_CHARACTER",
                            updates: { color: e.target.value },
                          })
                        }
                        disabled={state.isImporting}
                        className="h-8 p-1"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addCharacter}
                      disabled={
                        !state.newCharacter.tag.trim() || state.isImporting
                      }
                      className="mt-4"
                    >
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        dispatch({ type: "SET_SHOW_ADD_FORM", value: false })
                      }
                      disabled={state.isImporting}
                      className="mt-4"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add another character button (when there are already characters) */}
          {(newCount > 0 || existingCount > 0 || specialCount > 0) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                dispatch({
                  type: "SET_SHOW_ADD_FORM",
                  value: !state.showAddForm,
                })
              }
              disabled={state.isImporting}
              className="w-full"
            >
              <Plus className="size-4 mr-2" />
              {state.showAddForm ? "Cancel" : "Add Another Character"}
            </Button>
          )}

          {/* Manual add form (expanded) */}
          {state.showAddForm &&
            (newCount > 0 || existingCount > 0 || specialCount > 0) && (
              <div className="p-3 bg-muted/30 rounded-md space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Character Tag
                    </Label>
                    <Input
                      placeholder="e.g., s, narrator"
                      value={state.newCharacter.tag}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_NEW_CHARACTER",
                          updates: { tag: e.target.value },
                        })
                      }
                      disabled={state.isImporting}
                      className="h-7 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Display Name (in BF)
                    </Label>
                    <Input
                      placeholder="e.g., Sarah"
                      value={state.newCharacter.displayName}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_NEW_CHARACTER",
                          updates: { displayName: e.target.value },
                        })
                      }
                      disabled={state.isImporting}
                      className="h-7 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Label className="text-xs text-muted-foreground">
                      Color:
                    </Label>
                    <Input
                      type="color"
                      value={state.newCharacter.color}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_NEW_CHARACTER",
                          updates: { color: e.target.value },
                        })
                      }
                      disabled={state.isImporting}
                      className="h-7 w-16 p-1"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addCharacter}
                    disabled={
                      !state.newCharacter.tag.trim() || state.isImporting
                    }
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      dispatch({ type: "SET_SHOW_ADD_FORM", value: false })
                    }
                    disabled={state.isImporting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

          {/* New Characters */}
          {newCount > 0 && (
            <div className="border border-border/30 rounded-md overflow-hidden">
              <button
                onClick={() => toggleGroup("new")}
                className="w-full p-3 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-600" />
                  <span className="text-sm font-medium">New Characters</span>
                  <span className="text-xs text-muted-foreground">
                    ({newCount})
                  </span>
                </div>
                {state.expandedGroups.has("new") ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {state.expandedGroups.has("new") && (
                <div className="p-3 space-y-2 border-t border-border/30">
                  {state.groups.new.map((char, index) => {
                    const badge = getNameTypeBadge(char.nameType);
                    const showEmptyHint = char.nameType === "empty";
                    return (
                      <div
                        key={char.tag}
                        className="p-3 bg-background border border-border/30 rounded-md space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="checkbox"
                              checked={!char.excluded}
                              onChange={(e) =>
                                updateCharacter("new", index, {
                                  excluded: !e.target.checked,
                                })
                              }
                              className="size-4 rounded"
                              disabled={state.isImporting}
                              aria-label={`Include ${char.tag}`}
                            />
                            <span className="font-mono text-sm font-medium">
                              {char.tag}
                            </span>
                            {badge && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                title={badge.helper}
                                data-testid={`name-type-badge-${char.tag}`}
                              >
                                <AlertTriangle className="size-3" />
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className="size-6 rounded border border-border/30"
                              style={{ backgroundColor: char.color }}
                              title={char.color}
                            />
                            {char.excluded && (
                              <Ban className="size-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {!char.excluded && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Display Name (in BF)
                                </Label>
                                <Input
                                  value={char.displayName}
                                  placeholder={
                                    showEmptyHint ? "(unnamed)" : undefined
                                  }
                                  onChange={(e) =>
                                    updateCharacter("new", index, {
                                      displayName: e.target.value,
                                    })
                                  }
                                  className="h-7 text-sm"
                                  disabled={state.isImporting}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Color
                                </Label>
                                <Input
                                  type="color"
                                  value={char.color}
                                  onChange={(e) =>
                                    updateCharacter("new", index, {
                                      color: e.target.value,
                                    })
                                  }
                                  className="h-7 text-sm p-1"
                                  disabled={state.isImporting}
                                />
                              </div>
                            </div>
                            {badge && (
                              <p
                                className="text-xs text-muted-foreground"
                                data-testid={`name-type-helper-${char.tag}`}
                              >
                                {badge.helper}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Existing Characters with Conflicts */}
          {existingCount > 0 && (
            <div className="border border-amber-200 dark:border-amber-800 rounded-md overflow-hidden">
              <button
                onClick={() => toggleGroup("existing")}
                className="w-full p-3 bg-amber-50 dark:bg-amber-950/20 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-amber-600" />
                  <span className="text-sm font-medium">Conflicts</span>
                  <span className="text-xs text-muted-foreground">
                    ({existingCount})
                  </span>
                </div>
                {state.expandedGroups.has("existing") ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {state.expandedGroups.has("existing") && (
                <div className="p-3 space-y-2 border-t border-amber-200 dark:border-amber-800">
                  {state.groups.existing.map((conflict) => (
                    <div
                      key={conflict.tag}
                      className="p-3 bg-background border border-border/30 rounded-md"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-medium">
                          {conflict.tag}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Current:
                          </span>
                          <div
                            className="size-4 rounded border border-border/30"
                            style={{ backgroundColor: conflict.existingColor }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>
                          Current: {conflict.existingName} (
                          {conflict.existingColor})
                        </p>
                        <p>
                          Detected: {conflict.detectedName || "(none)"} (
                          {conflict.detectedColor})
                        </p>
                        <p className="text-amber-600 dark:text-amber-400 mt-1">
                          Review in character management after import
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Special Characters */}
          {specialCount > 0 && (
            <div className="border border-border/30 rounded-md overflow-hidden">
              <button
                onClick={() => toggleGroup("special")}
                className="w-full p-3 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <Ban className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Special Characters
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({specialCount})
                  </span>
                </div>
                {state.expandedGroups.has("special") ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {state.expandedGroups.has("special") && (
                <div className="p-3 space-y-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2">
                    These are typically system characters (narration, unknown
                    speakers) that can be excluded from import.
                  </p>
                  {state.groups.special.map((char, index) => (
                    <div
                      key={char.tag}
                      className="flex items-center justify-between p-2 bg-background border border-border/30 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!char.excluded}
                          onChange={(e) =>
                            updateCharacter("special", index, {
                              excluded: !e.target.checked,
                            })
                          }
                          className="size-4 rounded"
                          disabled={state.isImporting}
                          aria-label={`Include ${char.tag}`}
                        />
                        <span className="font-mono text-sm">{char.tag}</span>
                        <span className="text-xs text-muted-foreground">
                          ({char.displayName || "(unnamed)"})
                        </span>
                      </div>
                      <div
                        className="size-4 rounded border border-border/30"
                        style={{ backgroundColor: char.color }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Settings */}
          <div className="p-3 bg-muted/50 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-muted-foreground" />
                <label
                  htmlFor={linkToLinesId}
                  className="text-sm font-medium cursor-pointer"
                >
                  Automatically link characters to dialogue lines
                </label>
              </div>
              <input
                id={linkToLinesId}
                type="checkbox"
                checked={state.linkToLines}
                onChange={(e) =>
                  dispatch({
                    type: "SET_LINK_TO_LINES",
                    value: e.target.checked,
                  })
                }
                className="size-4 rounded"
                disabled={state.isImporting}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-between items-center shrink-0">
          <span className="text-sm text-muted-foreground">
            {selectedCount} character(s) selected
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={state.isImporting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={state.isImporting || selectedCount === 0}
            >
              {state.isImporting
                ? "Importing..."
                : `Import ${selectedCount} Character${
                    selectedCount !== 1 ? "s" : ""
                  }`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
