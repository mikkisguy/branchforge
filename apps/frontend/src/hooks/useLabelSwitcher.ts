import { useCallback } from "react";

const saveFailureMessage =
  "Could not save pending edits. Resolve the save error before switching labels.";
const saveFailureTitle = "Label switch blocked";

interface UseLabelSwitcherProps {
  activeLabelId: string | null;
  isDirty: boolean;
  triggerSave: () => Promise<boolean>;
  onSwitch: (labelId: string) => void;
  showErrorToast: (message: string, title: string) => void;
}

interface UseLabelSwitcherReturn {
  handleSelectLabel: (labelId: string) => Promise<boolean>;
}

export function useLabelSwitcher({
  activeLabelId,
  isDirty,
  triggerSave,
  onSwitch,
  showErrorToast,
}: UseLabelSwitcherProps): UseLabelSwitcherReturn {
  const handleSelectLabel = useCallback(
    async (labelId: string) => {
      if (activeLabelId === labelId) {
        return true;
      }

      if (activeLabelId && isDirty) {
        try {
          const flushed = await triggerSave();
          if (!flushed) {
            showErrorToast(saveFailureMessage, saveFailureTitle);
            return false;
          }
        } catch {
          showErrorToast(saveFailureMessage, saveFailureTitle);
          return false;
        }
      }

      onSwitch(labelId);
      return true;
    },
    [activeLabelId, isDirty, onSwitch, showErrorToast, triggerSave]
  );

  return { handleSelectLabel };
}
