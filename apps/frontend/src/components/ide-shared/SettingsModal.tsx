import { useEffect, useState, useMemo, useRef } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { ProjectsSettingsContent } from "@/components/ide-shared/ProjectsSettingsContent";
import { IntegrationsSettingsContent } from "@/components/ide-shared/IntegrationsSettingsContent";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/ide-shared/SettingsLayout";
import { WritingGoalSettings } from "@/components/write-mode/WritingGoalSettings";
import { cn } from "@/lib/utils";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import { APP_NAME, APP_VERSION } from "@/lib/version";

export type Tab = "user" | "projects" | "integrations" | "system";

export const SETTINGS_TABS = [
  "user",
  "projects",
  "integrations",
  "system",
] as const;

interface TabOption {
  id: Tab;
  label: string;
}

const tabs: TabOption[] = [
  { id: "user", label: "User" },
  { id: "projects", label: "Projects" },
  { id: "integrations", label: "Integrations" },
  { id: "system", label: "System Admin" },
];

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onUpdateProject?: (
    projectId: string,
    body: UpdateProjectBody
  ) => Promise<Project>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onImportFromGitLab?: () => void;
  onImportZip?: () => void;
  initialTab?: Tab;
}

export function SettingsModal({
  open,
  onOpenChange,
  projects,
  onUpdateProject,
  onDeleteProject,
  onImportFromGitLab,
  onImportZip,
  initialTab,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "user");
  const prevOpenRef = useRef<boolean>(open);

  const { user } = useAuth();
  const {
    signUpsEnabled,
    updateSignUpsSetting,
    isLoading: settingsLoading,
    isSaving,
  } = useSettings();

  // Detect dialog open transition to apply initialTab
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (justOpened && initialTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  const desiredTab = activeTab;

  // Compute visible tabs and ensure valid active tab
  // Only users with OWNER role can see the System Admin tab.
  const { visibleTabs, adjustedActiveTab } = useMemo(() => {
    const visibleTabs = tabs.filter(
      (tab) => tab.id !== "system" || user?.role === "OWNER"
    );

    // If current desired tab is not visible, switch to first visible tab
    const adjustedActiveTab = visibleTabs.find((t) => t.id === desiredTab)
      ? desiredTab
      : visibleTabs[0]?.id || desiredTab;

    return { visibleTabs, adjustedActiveTab };
  }, [desiredTab, user?.role]);

  // Sync derived state during render: adjustedActiveTab is computed from visibleTabs,
  // desiredTab, and user?.role. If the active tab becomes invalid (e.g., user loses OWNER
  // role or the dialog just opened with an initialTab), we sync immediately to avoid a
  // flash/stale UI that useEffect would cause.
  // The condition (adjustedActiveTab !== activeTab) becomes false after setActiveTab
  // updates state, preventing render loops.
  if (adjustedActiveTab !== activeTab) {
    setActiveTab(adjustedActiveTab);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[800px] max-w-[95vw] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 flex-row items-center justify-between border-b border-border/30">
          <DialogTitle>Settings</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close settings"
          >
            <X className="size-5" />
          </Button>
        </DialogHeader>

        <div className="flex h-[700px] max-h-[calc(95vh-120px)]">
          {/* Vertical Tabs */}
          <div className="w-48 border-r border-border/30 p-2 flex flex-col">
            <div className="space-y-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Version */}
            <div className="mt-auto pt-4 px-3">
              <p className="text-xs text-muted-foreground">
                {APP_NAME} v{APP_VERSION}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "user" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">User Settings</h3>

                <SettingsSection title="Account">
                  <SettingsRow
                    label="Email address"
                    description="Used for sign in and account identification"
                  >
                    <p className="max-w-[22rem] break-all rounded-md border border-border/50 bg-background/80 px-3 py-2 text-xs font-mono">
                      {user?.email || "Not available"}
                    </p>
                  </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Writing Goals">
                  <WritingGoalSettings />
                </SettingsSection>
              </div>
            )}

            {activeTab === "projects" && (
              <ProjectsSettingsContent
                projects={projects}
                onUpdateProject={onUpdateProject}
                onDeleteProject={onDeleteProject}
                onImportFromGitLab={onImportFromGitLab}
                onImportZip={onImportZip}
              />
            )}

            {activeTab === "integrations" && <IntegrationsSettingsContent />}

            {activeTab === "system" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">System Administration</h3>

                <SettingsSection title="User Registration">
                  <SettingsRow
                    label="Sign ups enabled"
                    description="Allow new users to register"
                  >
                    <Switch
                      checked={signUpsEnabled}
                      onCheckedChange={updateSignUpsSetting}
                      disabled={settingsLoading || isSaving}
                    />
                  </SettingsRow>
                </SettingsSection>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
