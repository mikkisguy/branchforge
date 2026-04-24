import { GitLabSettingsContent } from "@/components/ide-shared/GitLabSettingsContent";

export function IntegrationsSettingsContent() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connect external services to extend BranchForge functionality
        </p>
      </div>

      <GitLabSettingsContent />
    </div>
  );
}
