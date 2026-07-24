import { Settings } from "lucide-react";
import type { WizardAction } from "./wizard-store";

interface WizardLinkToggleProps {
  linkToLinesId: string;
  linkToLines: boolean;
  isImporting: boolean;
  dispatch: React.Dispatch<WizardAction>;
}

export function WizardLinkToggle({
  linkToLinesId,
  linkToLines,
  isImporting,
  dispatch,
}: WizardLinkToggleProps) {
  return (
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
          checked={linkToLines}
          onChange={(e) =>
            dispatch({
              type: "SET_LINK_TO_LINES",
              value: e.target.checked,
            })
          }
          className="size-4 rounded"
          disabled={isImporting}
        />
      </div>
    </div>
  );
}
