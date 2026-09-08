import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { ProjectsSettingsContent } from "@/components/ide-shared/ProjectsSettingsContent";
import { IntegrationsSettingsContent } from "@/components/ide-shared/IntegrationsSettingsContent";
import { ExportHistoryDialog } from "@/components/ide-shared/ExportHistoryDialog";
import { projectFilesApi } from "@/lib/api/project-files";
import { exportKeys } from "@/lib/query-keys";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import type { Tab } from "../settings-types";
import { SettingsModalNav } from "./SettingsModalNav";
import { SettingsModalUserTab } from "./SettingsModalUserTab";
import { SettingsModalSystemTab } from "./SettingsModalSystemTab";

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

const tabs = [
  { id: "user" as const, label: "User" },
  { id: "projects" as const, label: "Projects" },
  { id: "integrations" as const, label: "Integrations" },
  { id: "system" as const, label: "System Admin" },
];

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "user");
  const prevOpenRef = useRef(open);

  // Export history dialog state
  const [exportHistoryProject, setExportHistoryProject] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Handle export: generate + download
  const handleExportProject = useCallback(
    async (projectId: string) => {
      const result = await projectFilesApi.generateExport(projectId);
      await projectFilesApi.downloadExport(projectId, result.id);
      queryClient.invalidateQueries({
        queryKey: exportKeys.lists(projectId),
      });
    },
    [queryClient]
  );

  // Handle viewing export history
  const handleViewExportHistory = useCallback(
    (projectId: string, projectName: string) => {
      setExportHistoryProject({ id: projectId, name: projectName });
    },
    []
  );

  const { user } = useAuth();
  const {
    signUpsEnabled,
    updateSignUpsSetting,
    isLoading: settingsLoading,
    isSaving,
  } = useSettings();

  // Detect dialog open transition to apply initialTab
  useEffect(() => {
    if (open && !prevOpenRef.current && initialTab) {
      setActiveTab(initialTab);
    }
    prevOpenRef.current = open;
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
  if (adjustedActiveTab !== activeTab) {
    setActiveTab(adjustedActiveTab);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setExportHistoryProject(null);
      }}
    >
      <DialogContent className="flex w-[800px] max-w-[95vw] flex-col gap-0 overflow-hidden border-border bg-raised p-0 max-sm:p-0 md:h-[min(780px,85vh)] max-md:h-[min(85vh,calc(100%-32px))]">
        <DialogHeader className="mb-0 shrink-0 flex-row items-center justify-between space-y-0 border-b border-border p-6 pb-4 max-md:px-4 max-md:pt-4 max-md:pb-3">
          <DialogTitle>Settings</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 max-md:size-11"
            onClick={() => onOpenChange(false)}
            aria-label="Close settings"
          >
            <X className="size-5" />
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 max-md:flex-col">
          <SettingsModalNav
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {/* Tab Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6 max-md:px-4">
            {activeTab === "user" && <SettingsModalUserTab user={user} />}

            {activeTab === "projects" && (
              <ProjectsSettingsContent
                projects={projects}
                onUpdateProject={onUpdateProject}
                onDeleteProject={onDeleteProject}
                onImportFromGitLab={onImportFromGitLab}
                onImportZip={onImportZip}
                onExportProject={handleExportProject}
                onViewExportHistory={handleViewExportHistory}
              />
            )}

            {activeTab === "integrations" && <IntegrationsSettingsContent />}

            {activeTab === "system" && (
              <SettingsModalSystemTab
                signUpsEnabled={signUpsEnabled}
                onSignUpsChange={updateSignUpsSetting}
                disabled={settingsLoading || isSaving}
              />
            )}
          </div>
        </div>
      </DialogContent>

      {/* Export History Dialog — rendered outside settings modal so it stacks */}
      {exportHistoryProject && (
        <ExportHistoryDialog
          open={!!exportHistoryProject}
          onOpenChange={(isOpen) => {
            if (!isOpen) setExportHistoryProject(null);
          }}
          projectId={exportHistoryProject.id}
          projectName={exportHistoryProject.name}
        />
      )}
    </Dialog>
  );
}
