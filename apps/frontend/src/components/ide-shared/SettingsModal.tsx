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
import { useProject } from "@/hooks/useProject";
import { GitLabSettingsContent } from "@/components/ide-shared/GitLabSettingsContent";
import { RouteConfigDialog } from "@/components/RouteConfigDialog";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_VERSION } from "@/lib/version";

type Tab = "user" | "gitlab" | "routes" | "system";

interface TabOption {
  id: Tab;
  label: string;
}

const tabs: TabOption[] = [
  { id: "user", label: "User" },
  { id: "gitlab", label: "GitLab" },
  { id: "routes", label: "Routes" },
  { id: "system", label: "System Admin" },
];

/**
 * Helper function to filter tabs based on user role and ensure a valid active tab.
 * Only users with OWNER role can see the System Admin tab.
 * Routes tab only shows when a project is selected.
 *
 * @param activeTab - The currently active tab
 * @param userRole - The user's role (optional)
 * @param hasProject - Whether a project is selected
 * @returns An object with filtered tabs and the appropriate active tab
 */
function getVisibleTabs(
  activeTab: Tab,
  userRole?: string,
  hasProject?: boolean
) {
  return useMemo(() => {
    // Filter out system tab for non-OWNER users
    // Filter out routes tab when no project is selected
    const visibleTabs = tabs.filter(
      (tab) =>
        (tab.id !== "system" || userRole === "OWNER") &&
        (tab.id !== "routes" || hasProject)
    );

    // If current active tab is not visible, switch to first visible tab
    const adjustedActiveTab = visibleTabs.find((t) => t.id === activeTab)
      ? activeTab
      : visibleTabs[0]?.id || activeTab;

    return { visibleTabs, activeTab: adjustedActiveTab };
  }, [activeTab, userRole, hasProject]);
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("user");
  const [isRouteConfigOpen, setIsRouteConfigOpen] = useState(false);
  const { user } = useAuth();
  const { currentProject } = useProject();
  const {
    signUpsEnabled,
    updateSignUpsSetting,
    isLoading: settingsLoading,
    isSaving,
  } = useSettings();

  // Use helper to get visible tabs and ensure valid active tab
  const { visibleTabs, activeTab: adjustedActiveTab } = getVisibleTabs(
    activeTab,
    user?.role,
    !!currentProject?.id
  );

  // Sync state if active tab was adjusted by helper
  useMemo(() => {
    if (adjustedActiveTab !== activeTab) {
      setActiveTab(adjustedActiveTab);
    }
  }, [adjustedActiveTab, activeTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 flex-row items-center justify-between border-b border-border/30">
          <DialogTitle>Settings</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="flex h-[500px]">
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
          <div className="flex-1 p-6">
            {activeTab === "user" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">User Information</h3>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Email</label>
                  <p className="text-sm font-mono bg-muted/50 px-3 py-2 rounded-md">
                    {user?.email || "Not available"}
                  </p>
                </div>
              </div>
            )}

            {activeTab === "gitlab" && <GitLabSettingsContent />}

            {activeTab === "routes" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium">Route Configuration</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Define the routes for your visual novel project. Routes
                    determine character paths and story branching.
                  </p>
                </div>
                <div className="p-6 border border-dashed border-border/30 rounded-md text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure route keys, names, jump prefixes, and shared route
                    settings for your project.
                  </p>
                  <button
                    onClick={() => setIsRouteConfigOpen(true)}
                    className="px-4 py-2 bg-[var(--theme-color)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Open Route Configuration
                  </button>
                </div>
              </div>
            )}

            {activeTab === "system" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">System Administration</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">
                        Sign ups enabled
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Allow new users to register
                      </p>
                    </div>
                    <Switch
                      checked={signUpsEnabled}
                      onCheckedChange={updateSignUpsSetting}
                      disabled={settingsLoading || isSaving}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Route Config Dialog */}
      {currentProject?.id && (
        <RouteConfigDialog
          open={isRouteConfigOpen}
          onOpenChange={setIsRouteConfigOpen}
          projectId={currentProject.id}
        />
      )}
    </Dialog>
  );
}
