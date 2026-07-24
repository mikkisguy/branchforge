import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardAction } from "./wizard-store";

interface WizardEmptyStateProps {
  showAddForm: boolean;
  newCharacter: { tag: string; displayName: string; color: string };
  isImporting: boolean;
  dispatch: React.Dispatch<WizardAction>;
  addCharacter: () => void;
}

export function WizardEmptyState({
  showAddForm,
  newCharacter,
  isImporting,
  dispatch,
  addCharacter,
}: WizardEmptyStateProps) {
  return (
    <div className="text-center p-6 border border-dashed border-border/50 rounded-md">
      <p className="text-sm text-muted-foreground mb-3">
        No characters were detected from your RPY files
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Your RPY files may use custom character definition patterns. You can add
        characters manually.
      </p>
      {!showAddForm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "SET_SHOW_ADD_FORM", value: true })}
          disabled={isImporting}
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
              value={newCharacter.tag}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_NEW_CHARACTER",
                  updates: { tag: e.target.value },
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
                dispatch({
                  type: "UPDATE_NEW_CHARACTER",
                  updates: { displayName: e.target.value },
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
                  dispatch({
                    type: "UPDATE_NEW_CHARACTER",
                    updates: { color: e.target.value },
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
              onClick={() =>
                dispatch({ type: "SET_SHOW_ADD_FORM", value: false })
              }
              disabled={isImporting}
              className="mt-4"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
