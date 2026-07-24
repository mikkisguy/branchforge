import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { WizardAction } from "./wizard-store";

interface WizardAddFormProps {
  newCharacter: { tag: string; displayName: string; color: string };
  isImporting: boolean;
  dispatch: React.Dispatch<WizardAction>;
  addCharacter: () => void;
  onClose: () => void;
}

export function WizardAddForm({
  newCharacter,
  isImporting,
  dispatch,
  addCharacter,
  onClose,
}: WizardAddFormProps) {
  return (
    <div className="p-3 bg-muted/30 rounded-md space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Character Tag</Label>
          <Input
            placeholder="e.g., s, narrator"
            value={newCharacter.tag}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_NEW_CHARACTER",
                updates: { tag: e.target.value },
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
              dispatch({
                type: "UPDATE_NEW_CHARACTER",
                updates: { displayName: e.target.value },
              })
            }
            disabled={isImporting}
            className="h-7 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Label className="text-xs text-muted-foreground">Color:</Label>
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
          onClick={onClose}
          disabled={isImporting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
