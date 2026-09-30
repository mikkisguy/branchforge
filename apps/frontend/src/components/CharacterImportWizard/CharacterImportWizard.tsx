import { useMemo, useReducer, useCallback, useId } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { charactersApi, type ImportCharacter } from "@/lib/api/characters";
import type { DetectedCharacter, CharacterConflict } from "@branchforge/shared";
import { useToast } from "@/contexts/ToastContext";
import { useQueryClient } from "@tanstack/react-query";
import { labelKeys, characterKeys } from "@/lib/query-keys";
import {
  type EditableCharacter,
  type CharacterGroup,
  type CharacterGroups,
  createInitialWizardState,
  wizardReducer,
} from "./wizard-store";
import { WizardHeader } from "./WizardHeader";
import { WizardEmptyState } from "./WizardEmptyState";
import { WizardAddForm } from "./WizardAddForm";
import { WizardNewCharacters } from "./WizardNewCharacters";
import { WizardConflicts } from "./WizardConflicts";
import { WizardSpecialCharacters } from "./WizardSpecialCharacters";
import { WizardLinkToggle } from "./WizardLinkToggle";
import { WizardFooter } from "./WizardFooter";

const EMPTY_TAGS: string[] = [];

export interface CharacterImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  detectedCharacters: DetectedCharacter[];
  conflicts: CharacterConflict[];
  excludedTags: string[];
  narratorTags: string[];
  existingTags?: string[];
  onComplete?: () => void;
}

export type { EditableCharacter, CharacterGroup } from "./wizard-store";

export function CharacterImportWizard({
  open,
  onOpenChange,
  projectId,
  detectedCharacters,
  conflicts,
  excludedTags,
  narratorTags,
  existingTags = EMPTY_TAGS,
  onComplete,
}: CharacterImportWizardProps) {
  const linkToLinesId = useId();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    wizardReducer,
    { detectedCharacters, conflicts, excludedTags, narratorTags, existingTags },
    (v) =>
      createInitialWizardState(
        v.detectedCharacters,
        v.conflicts,
        v.excludedTags,
        v.narratorTags,
        v.existingTags
      )
  );

  const toggleGroup = useCallback((group: keyof CharacterGroup) => {
    dispatch({ type: "TOGGLE_GROUP", group });
  }, []);

  const updateCharacter = useCallback(
    (
      group: CharacterGroups,
      index: number,
      updates: Partial<EditableCharacter>
    ) => {
      dispatch({ type: "UPDATE_CHARACTER", group, index, updates });
    },
    []
  );

  const excludedTagSet = useMemo(() => new Set(excludedTags), [excludedTags]);

  const handleImport = useCallback(async () => {
    dispatch({ type: "SET_IMPORTING", value: true });
    try {
      const importData: ImportCharacter[] = [
        ...state.groups.new.filter((c) => !c.excluded),
        ...state.groups.special.filter((c) => !c.excluded),
      ].map((c) => ({
        tag: c.tag,
        name: c.name,
        displayName: c.displayName || c.tag,
        color: c.color,
        isLoveInterest: c.isLoveInterest ?? false,
        isNarrator: c.isNarrator ?? false,
        nameType: c.nameType,
      }));
      for (const c of state.groups.existing) {
        if (state.approvedUpdates.has(c.tag) && !excludedTagSet.has(c.tag)) {
          const detected = detectedCharacters.find(
            (char) => char.tag === c.tag
          );
          importData.push({
            tag: c.tag,
            name: c.detectedName,
            displayName: c.existingDisplayName ?? c.existingName,
            color: c.detectedColor,
            nameType: c.detectedNameType ?? detected?.nameType,
          });
        }
      }
      const newExcludedTags = new Set(excludedTags);
      const newNarratorTags = new Set(narratorTags);
      for (const c of state.groups.new) {
        if (c.excluded) newExcludedTags.add(c.tag);
        else if (c.isNarrator) newNarratorTags.add(c.tag);
        else newNarratorTags.delete(c.tag);
      }
      for (const c of state.groups.special) {
        if (c.excluded) newExcludedTags.add(c.tag);
        else if (c.isNarrator) newNarratorTags.add(c.tag);
        else newNarratorTags.delete(c.tag);
      }
      const result = await charactersApi.importCharacters(projectId, {
        characters: importData,
        excludedTags: [...newExcludedTags],
        narratorTags: [...newNarratorTags],
        linkToLines: state.linkToLines,
      });
      success(`Applied changes to ${result.characters.length} character(s)`);
      if (result.unmatched.length > 0) {
        error(`${result.unmatched.length} speaker(s) could not be matched`);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: labelKeys.scoped(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: characterKeys.lists(projectId),
        }),
      ]);
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
    excludedTagSet,
    detectedCharacters,
    excludedTags,
    narratorTags,
    projectId,
    onOpenChange,
    onComplete,
    success,
    error,
    queryClient,
  ]);

  const handleClose = useCallback(() => {
    if (!state.isImporting) onOpenChange(false);
  }, [state.isImporting, onOpenChange]);

  const addCharacter = useCallback(() => {
    const tag = state.newCharacter.tag.trim();
    if (!tag) return;
    const allTags = [
      ...state.groups.new.map((c) => c.tag.toLowerCase()),
      ...state.groups.existing.map((c) => c.tag.toLowerCase()),
      ...state.groups.special.map((c) => c.tag.toLowerCase()),
      ...existingTags.map((tag) => tag.toLowerCase()),
    ];
    if (allTags.includes(tag.toLowerCase())) return;
    dispatch({
      type: "ADD_CHARACTER",
      character: {
        tag,
        name: state.newCharacter.displayName || tag,
        displayName: state.newCharacter.displayName || tag,
        color: state.newCharacter.color,
        isSpecial: false,
        sourceFile: "manual",
        confidence: 1,
        nameType: "literal",
        excluded: false,
      },
    });
  }, [state.newCharacter, state.groups, existingTags]);

  const newCount = state.groups.new.length;
  const existingCount = state.groups.existing.length;
  const specialCount = state.groups.special.length;
  const selectedCount =
    state.groups.new.filter((c) => !c.excluded).length +
    state.groups.existing.filter(
      (c) => state.approvedUpdates.has(c.tag) && !excludedTagSet.has(c.tag)
    ).length +
    state.groups.special.filter((c) => !c.excluded).length;
  const isEmpty =
    newCount === 0 &&
    existingCount === 0 &&
    specialCount === 0 &&
    state.groups.unchanged.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(n) => {
        if (!n) handleClose();
      }}
      aria-label="Review Characters"
    >
      <DialogContent className="max-w-2xl w-full p-0 gap-0 max-h-[80vh] overflow-hidden flex flex-col">
        <WizardHeader
          detectedCount={detectedCharacters.length}
          manualCount={newCount}
          onClose={handleClose}
          disabled={state.isImporting}
        />
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isEmpty ? (
            <WizardEmptyState
              showAddForm={state.showAddForm}
              newCharacter={state.newCharacter}
              isImporting={state.isImporting}
              dispatch={dispatch}
              addCharacter={addCharacter}
            />
          ) : (
            <>
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
              {state.showAddForm && (
                <WizardAddForm
                  newCharacter={state.newCharacter}
                  isImporting={state.isImporting}
                  dispatch={dispatch}
                  addCharacter={addCharacter}
                  onClose={() =>
                    dispatch({ type: "SET_SHOW_ADD_FORM", value: false })
                  }
                />
              )}
            </>
          )}
          {newCount > 0 && (
            <WizardNewCharacters
              characters={state.groups.new}
              expanded={state.expandedGroups.has("new")}
              onToggle={() => toggleGroup("new")}
              updateCharacter={updateCharacter}
              isImporting={state.isImporting}
            />
          )}
          {existingCount > 0 && (
            <WizardConflicts
              conflicts={state.groups.existing}
              approvedUpdates={state.approvedUpdates}
              isImporting={state.isImporting}
              onChoose={(tag, approved) =>
                dispatch({
                  type: "SET_DEFINITION_UPDATE",
                  tag,
                  approved,
                })
              }
              expanded={state.expandedGroups.has("existing")}
              onToggle={() => toggleGroup("existing")}
            />
          )}
          {state.groups.unchanged.length > 0 && (
            <details className="border border-border/30 rounded-md p-3">
              <summary className="text-sm font-medium cursor-pointer">
                Already imported ({state.groups.unchanged.length})
              </summary>
              <p className="text-xs text-muted-foreground mt-2">
                These definitions match. Your BranchForge settings are
                preserved.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {state.groups.unchanged.map((char) => (
                  <li
                    key={char.tag}
                    data-testid={`already-imported-badge-${char.tag}`}
                  >
                    <span className="font-mono">{char.tag}</span>
                    {narratorTags.includes(char.tag) && (
                      <span className="ml-2 text-muted-foreground">
                        Narrator
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {specialCount > 0 && (
            <WizardSpecialCharacters
              characters={state.groups.special}
              expanded={state.expandedGroups.has("special")}
              onToggle={() => toggleGroup("special")}
              updateCharacter={updateCharacter}
              isImporting={state.isImporting}
            />
          )}
          <WizardLinkToggle
            linkToLinesId={linkToLinesId}
            linkToLines={state.linkToLines}
            isImporting={state.isImporting}
            dispatch={dispatch}
          />
        </div>
        <WizardFooter
          selectedCount={selectedCount}
          isImporting={state.isImporting}
          onClose={handleClose}
          onImport={handleImport}
        />
      </DialogContent>
    </Dialog>
  );
}
