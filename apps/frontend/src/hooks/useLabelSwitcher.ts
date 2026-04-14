import { useCallback, useRef } from "react";

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
  const pendingSwitch = useRef<Promise<boolean> | null>(null);
  const queuedLabelId = useRef<string | null>(null);

  const executeSwitch = useCallback(
    async (labelId: string): Promise<boolean> => {
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

  const handleSelectLabel = useCallback(
    async (labelId: string): Promise<boolean> => {
      if (pendingSwitch.current) {
        queuedLabelId.current = labelId;
        return true;
      }

      const switchPromise = (async () => {
        let currentLabelId: string | null = labelId;
        let result = true;

        while (currentLabelId) {
          result = await executeSwitch(currentLabelId);

          const nextLabelId = queuedLabelId.current;
          queuedLabelId.current = null;
          currentLabelId = nextLabelId;
        }

        return result;
      })();

      pendingSwitch.current = switchPromise;

      try {
        return await switchPromise;
      } finally {
        pendingSwitch.current = null;
      }
    },
    [executeSwitch]
  );

  return { handleSelectLabel };
}
