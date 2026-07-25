/**
 * Route Settings Dialog
 *
 * Standalone wrapper that hosts the Routes settings inside a
 * `DialogShell`. The body is provided by `RouteSettingsContent`,
 * which is also used by the unified `ProjectSettingsDialog`.
 *
 * Currently no sidebar entry opens this directly — the unified
 * modal is the primary entry. This component is kept so future
 * call sites (e.g. a deep-link from the flow graph) can open
 * just the Routes section without the full settings chrome.
 *
 * Intentionally retained orphan (deslop/unused-file): react-doctor
 * reports unused-file at line 0, so inline disable comments cannot
 * suppress it. Same intentional-keep class as `src/copy/*` (#222).
 * The `deslop/unused-file` rule is also ignored via doctor.config.json.
 */

import { DialogShell } from "@/components/ui/DialogShell";
import { RouteSettingsContent } from "@/components/routes/RouteSettingsContent";

interface RouteSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function RouteSettingsDialog({
  open,
  onOpenChange,
  projectId,
}: RouteSettingsDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Route Configuration"
      description="Configure route settings for your project."
      maxWidth="3xl"
    >
      <RouteSettingsContent projectId={projectId} />
    </DialogShell>
  );
}
