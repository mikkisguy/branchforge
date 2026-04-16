import { useState, useMemo } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { GitLabSettingsContent } from "@/components/ide-shared/GitLabSettingsContent";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/ide-shared/SettingsLayout";
import { WritingGoalSettings } from "@/components/write-mode/WritingGoalSettings";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_VERSION } from "@/lib/version";

type Tab = "user" | "gitlab" | "system";

interface TabOption {
  id: Tab;
  label: string;
}

const tabs: TabOption[] = [
  { id: "user", label: "User" },
  { id: "gitlab", label: "GitLab" },
  { id: "system", label: "System Admin" },
];

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("user");
  const { user } = useAuth();
  const {
    signUpsEnabled,
    updateSignUpsSetting,
    isLoading: settingsLoading,
    isSaving,
  } = useSettings();

  // Compute visible tabs and ensure valid active tab
  // Only users with OWNER role can see the System Admin tab.
  const { visibleTabs, adjustedActiveTab } = useMemo(() => {
    const visibleTabs = tabs.filter(
      (tab) => tab.id !== "system" || user?.role === "OWNER"
    );

    // If current active tab is not visible, switch to first visible tab
    const adjustedActiveTab = visibleTabs.find((t) => t.id === activeTab)
      ? activeTab
      : visibleTabs[0]?.id || activeTab;

    return { visibleTabs, adjustedActiveTab };
  }, [activeTab, user?.role]);

  // Sync derived state during render: adjustedActiveTab is computed from visibleTabs,
  // activeTab, and currentProject. If the active tab becomes invalid (e.g., user loses
  // project access), we must sync immediately to avoid a flash/stale UI that useEffect
  // would cause. The condition (adjustedActiveTab !== activeTab) becomes false after
  // setActiveTab updates state, preventing render loops.
  if (adjustedActiveTab !== activeTab) {
    setActiveTab(adjustedActiveTab);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 flex-row items-center justify-between border-b border-border/30">
          <DialogTitle>Settings</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="flex h-[650px]">
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

            {activeTab === "gitlab" && <GitLabSettingsContent />}

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
