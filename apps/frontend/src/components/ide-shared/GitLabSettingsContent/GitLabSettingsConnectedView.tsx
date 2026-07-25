import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/ide-shared/SettingsLayout";

interface GitLabSettingsConnectedViewProps {
  isRemoving: boolean;
  onRemove: () => void;
}

export function GitLabSettingsConnectedView({
  isRemoving,
  onRemove,
}: GitLabSettingsConnectedViewProps) {
  return (
    <div className="space-y-3">
      <SettingsSection title="Connection Status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">GitLab connected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your integration is active and ready to import projects.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRemove}
            disabled={isRemoving}
          >
            {isRemoving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            <span className="ml-2">Remove</span>
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
