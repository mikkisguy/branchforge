import { useEffect } from "react";

interface WorkspaceFocusReporterProps {
  active: boolean;
  onFocusModeChange?: (focused: boolean) => void;
}

/** Reports workspace chrome visibility only while the editor surface is mounted. */
export function WorkspaceFocusReporter({
  active,
  onFocusModeChange,
}: WorkspaceFocusReporterProps) {
  useEffect(() => {
    onFocusModeChange?.(active);
    return () => onFocusModeChange?.(false);
  }, [active, onFocusModeChange]);

  return null;
}
