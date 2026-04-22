/**
 * Character Import Wizard
 *
 * Dialog for reviewing and approving detected characters from RPY files.
 * Shows new characters, existing characters with conflicts, and special characters.
 */

import { useState, useCallback, useId } from "react";
import {
  X,
  User,
  CheckCircle2,
  AlertCircle,
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
import type { DetectedCharacter, CharacterConflict } from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";

// ============================================================================
// Types
// ============================================================================

interface CharacterImportWizardProps {
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
      excluded: excludedTags.includes(char.tag) || (isSpecial && !isConflict),
      isLoveInterest: false,
      routeAffiliation: undefined,
    };

    if (isConflict) {
      // Find the conflict info
      const conflict = conflicts.find((c) => c.tag === char.tag);
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

  // Group characters on mount
  const [groups, setGroups] = useState<CharacterGroup>(() =>
    groupCharacters(detectedCharacters, conflicts, excludedTags)
  );

  // Import settings
  const [linkToLines, setLinkToLines] = useState(true);

  // Track which groups are expanded
  const [expandedGroups, setExpandedGroups] = useState<
    Set<keyof CharacterGroup>
  >(new Set(["new", "existing", "special"]));

  // Loading state
  const [isImporting, setIsImporting] = useState(false);

  // Add character form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCharacter, setNewCharacter] = useState({
    tag: "",
    displayName: "",
    color:
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0"),
  });

  /**
   * Toggle group expansion
   */
  const toggleGroup = useCallback((group: keyof CharacterGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
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
      setGroups((prev) => ({
        ...prev,
        [group]: prev[group].map((char, i) =>
          i === index ? { ...char, ...updates } : char
        ),
      }));
    },
    []
  );

  /**
   * Import characters
   */
  const handleImport = useCallback(async () => {
    setIsImporting(true);

    try {
      // Collect all non-excluded characters
      const charactersToImport = [
        ...groups.new.filter((c) => !c.excluded),
        ...groups.existing
          .filter((c) => !excludedTags.includes(c.tag))
          .map((c) => ({
            tag: c.tag,
            name: c.detectedName,
            displayName: c.detectedName || c.tag,
            color: c.detectedColor,
            isSpecial: false,
            sourceFile: "",
            confidence: 1,
            isLoveInterest: false,
            routeAffiliation: undefined,
          })),
        ...groups.special.filter((c) => !c.excluded),
      ];

      // Map to import format
      const importData: ImportCharacter[] = charactersToImport.map((c) => ({
        tag: c.tag,
        name: c.name ?? c.tag,
        displayName: c.displayName,
        color: c.color,
        isLoveInterest: c.isLoveInterest ?? false,
        routeAffiliation: c.routeAffiliation,
      }));

      const newExcludedTags = [
        ...excludedTags,
        ...groups.new.filter((c) => c.excluded).map((c) => c.tag),
        ...groups.special.filter((c) => c.excluded).map((c) => c.tag),
      ];

      const result = await charactersApi.importCharacters(projectId, {
        characters: importData,
        excludedTags: newExcludedTags,
        linkToLines,
      });

      success(`Imported ${result.characters.length} character(s)`);

      if (result.unmatched.length > 0) {
        error(`${result.unmatched.length} speaker(s) could not be matched`);
      }

      // Close dialog after short delay
      setTimeout(() => {
        onOpenChange(false);
        onComplete?.();
      }, 500);
    } catch (err) {
      error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }, [
    groups,
    excludedTags,
    linkToLines,
    projectId,
    onOpenChange,
    onComplete,
    success,
    error,
  ]);

  /**
   * Close handler
   */
  const handleClose = useCallback(() => {
    if (!isImporting) {
      onOpenChange(false);
    }
  }, [isImporting, onOpenChange]);

  /**
   * Add a new character manually
   */
  const addCharacter = useCallback(() => {
    if (!newCharacter.tag.trim()) {
      return;
    }

    const character: EditableCharacter = {
      tag: newCharacter.tag.trim(),
      name: newCharacter.displayName || newCharacter.tag,
      displayName: newCharacter.displayName || newCharacter.tag,
      color: newCharacter.color,
      isSpecial: false,
      sourceFile: "manual",
      confidence: 1,
      excluded: false,
    };

    setGroups((prev) => ({
      ...prev,
      new: [...prev.new, character],
    }));

    setNewCharacter({
      tag: "",
      displayName: "",
      color:
        "#" +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0"),
    });
    setShowAddForm(false);
  }, [newCharacter]);

  // Count totals
  const newCount = groups.new.length;
  const existingCount = groups.existing.length;
  const specialCount = groups.special.length;
  const selectedCount =
    groups.new.filter((c) => !c.excluded).length +
    groups.special.filter((c) => !c.excluded).length;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-md">
              <User className="w-5 h-5 text-primary" />
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
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={isImporting}
          >
            <X className="w-5 h-5" />
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
              {!showAddForm ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                  disabled={isImporting}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Character
                </Button>
              ) : (
                <div className="text-left space-y-3 max-w-sm mx-auto">
                  <div>
                    <Label className="text-xs">Character Tag</Label>
                    <Input
                      placeholder="e.g., s, narrator, protagonist"
                      value={newCharacter.tag}
                      onChange={(e) =>
                        setNewCharacter({
                          ...newCharacter,
                          tag: e.target.value,
                        })
                      }
                      disabled={isImporting}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      placeholder="e.g., Sarah, Narrator"
                      value={newCharacter.displayName}
                      onChange={(e) =>
                        setNewCharacter({
                          ...newCharacter,
                          displayName: e.target.value,
                        })
                      }
                      disabled={isImporting}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Color</Label>
                      <Input
                        type="color"
                        value={newCharacter.color}
                        onChange={(e) =>
                          setNewCharacter({
                            ...newCharacter,
                            color: e.target.value,
                          })
                        }
                        disabled={isImporting}
                        className="h-8 p-1"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addCharacter}
                      disabled={!newCharacter.tag.trim() || isImporting}
                      className="mt-4"
                    >
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddForm(false)}
                      disabled={isImporting}
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
              onClick={() => setShowAddForm(!showAddForm)}
              disabled={isImporting}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              {showAddForm ? "Cancel" : "Add Another Character"}
            </Button>
          )}

          {/* Manual add form (expanded) */}
          {showAddForm &&
            (newCount > 0 || existingCount > 0 || specialCount > 0) && (
              <div className="p-3 bg-muted/30 rounded-md space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Character Tag
                    </Label>
                    <Input
                      placeholder="e.g., s, narrator"
                      value={newCharacter.tag}
                      onChange={(e) =>
                        setNewCharacter({
                          ...newCharacter,
                          tag: e.target.value,
                        })
                      }
                      disabled={isImporting}
                      className="h-7 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Display Name (in BF)
                    </Label>
                    <Input
                      placeholder="e.g., Sarah"
                      value={newCharacter.displayName}
                      onChange={(e) =>
                        setNewCharacter({
                          ...newCharacter,
                          displayName: e.target.value,
                        })
                      }
                      disabled={isImporting}
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
                      value={newCharacter.color}
                      onChange={(e) =>
                        setNewCharacter({
                          ...newCharacter,
                          color: e.target.value,
                        })
                      }
                      disabled={isImporting}
                      className="h-7 w-16 p-1"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addCharacter}
                    disabled={!newCharacter.tag.trim() || isImporting}
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                    disabled={isImporting}
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
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">New Characters</span>
                  <span className="text-xs text-muted-foreground">
                    ({newCount})
                  </span>
                </div>
                {expandedGroups.has("new") ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {expandedGroups.has("new") && (
                <div className="p-3 space-y-2 border-t border-border/30">
                  {groups.new.map((char, index) => (
                    <div
                      key={char.tag}
                      className="p-3 bg-background border border-border/30 rounded-md space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!char.excluded}
                            onChange={(e) =>
                              updateCharacter("new", index, {
                                excluded: !e.target.checked,
                              })
                            }
                            className="w-4 h-4 rounded"
                            disabled={isImporting}
                          />
                          <span className="font-mono text-sm font-medium">
                            {char.tag}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border border-border/30"
                            style={{ backgroundColor: char.color }}
                            title={char.color}
                          />
                          {char.excluded && (
                            <Ban className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {!char.excluded && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Display Name (in BF)
                            </Label>
                            <Input
                              value={char.displayName}
                              onChange={(e) =>
                                updateCharacter("new", index, {
                                  displayName: e.target.value,
                                })
                              }
                              className="h-7 text-sm"
                              disabled={isImporting}
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
                              disabled={isImporting}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium">Conflicts</span>
                  <span className="text-xs text-muted-foreground">
                    ({existingCount})
                  </span>
                </div>
                {expandedGroups.has("existing") ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {expandedGroups.has("existing") && (
                <div className="p-3 space-y-2 border-t border-amber-200 dark:border-amber-800">
                  {groups.existing.map((conflict) => (
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
                            className="w-4 h-4 rounded border border-border/30"
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
                  <Ban className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Special Characters
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({specialCount})
                  </span>
                </div>
                {expandedGroups.has("special") ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {expandedGroups.has("special") && (
                <div className="p-3 space-y-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2">
                    These are typically system characters (narration, unknown
                    speakers) that can be excluded from import.
                  </p>
                  {groups.special.map((char, index) => (
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
                          className="w-4 h-4 rounded"
                          disabled={isImporting}
                        />
                        <span className="font-mono text-sm">{char.tag}</span>
                        <span className="text-xs text-muted-foreground">
                          ({char.displayName})
                        </span>
                      </div>
                      <div
                        className="w-4 h-4 rounded border border-border/30"
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
                <Settings className="w-4 h-4 text-muted-foreground" />
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
                checked={linkToLines}
                onChange={(e) => setLinkToLines(e.target.checked)}
                className="w-4 h-4 rounded"
                disabled={isImporting}
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
              variant="outline"
              onClick={handleClose}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={isImporting || selectedCount === 0}
            >
              {isImporting
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
