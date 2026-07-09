import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
} from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useUserSettings } from "@/hooks/useUserSettings";
import { ProjectsSettingsContent } from "@/components/ide-shared/ProjectsSettingsContent";
import { IntegrationsSettingsContent } from "@/components/ide-shared/IntegrationsSettingsContent";
import { ExportHistoryDialog } from "@/components/ide-shared/ExportHistoryDialog";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/ide-shared/SettingsLayout";
import { WritingGoalSettings } from "@/components/write-mode/WritingGoalSettings";
import { cn } from "@/lib/utils";
import { projectFilesApi } from "@/lib/api/project-files";
import { exportKeys } from "@/lib/query-keys";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import type { Tab } from "./settings-types";
import { AVATAR_MAX_SIZE_MB } from "@branchforge/shared";

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
    settings: userSettings,
    isLoading: userSettingsLoading,
    isSaving: userSettingsSaving,
    isUploading: userSettingsUploading,
    updateProfile: updateUserProfile,
    uploadAvatar,
    deleteAvatar,
  } = useUserSettings();
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

  const [username, setUsername] = useState(userSettings?.username ?? "");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsername(userSettings?.username ?? "");
  }, [userSettings?.username]);

  const handleSaveUserProfile = useCallback(async () => {
    setProfileMessage(null);
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      return;
    }
    if (trimmedUsername === userSettings?.username) {
      setProfileMessage("User profile saved");
      return;
    }
    try {
      await updateUserProfile({ username: trimmedUsername });
      setProfileMessage("User profile saved");
    } catch {
      // Error handled by mutation onError
    }
  }, [updateUserProfile, username, userSettings?.username]);

  const isUserSectionBusy =
    userSettingsLoading || userSettingsSaving || userSettingsUploading;

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
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setExportHistoryProject(null);
      }}
    >
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

        <div className="flex max-md:flex-col h-[700px] max-h-[calc(95vh-120px)] max-md:h-auto max-md:max-h-none">
          {/* Vertical Tabs */}
          <div className="w-48 border-r border-border/30 p-2 flex flex-col max-md:w-full max-md:border-r-0 max-md:border-b max-md:flex-row max-md:overflow-x-auto max-md:sticky max-md:top-0 max-md:bg-card max-md:z-10">
            <div className="space-y-1 max-md:flex max-md:space-y-0 max-md:space-x-1 max-md:gap-1">
              {visibleTabs.map((tab) => (
                <button
                  type="button"
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
            <div className="mt-auto pt-4 px-3 max-md:hidden">
              <p className="text-xs text-muted-foreground">
                {APP_NAME} v{APP_VERSION}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "user" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">User Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage your profile and writing preferences
                  </p>
                </div>

                <SettingsSection title="Profile">
                  <div className="space-y-5">
                    {/* Identity: avatar + email/username summary + actions */}
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0">
                        <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-muted">
                          {userSettings?.avatarUrl ? (
                            <img
                              src={userSettings.avatarUrl}
                              alt="User avatar"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                              {(
                                userSettings?.username ??
                                user?.email?.[0] ??
                                "U"
                              )
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>
                          )}
                        </div>
                        {userSettingsUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-medium">
                          {userSettings?.username || "Your profile"}
                        </p>
                        <p className="truncate text-xs font-mono text-muted-foreground">
                          {user?.email || "Not available"}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const file = event.target.files?.[0];
                            if (!file) return;

                            setAvatarError(null);
                            if (!file.type.startsWith("image/")) {
                              setAvatarError("Avatar must be an image file.");
                              return;
                            }
                            if (file.size > AVATAR_MAX_SIZE_MB * 1024 * 1024) {
                              setAvatarError(
                                `Avatar must be smaller than ${AVATAR_MAX_SIZE_MB}MB.`
                              );
                              return;
                            }

                            uploadAvatar(file);
                            if (avatarInputRef.current) {
                              avatarInputRef.current.value = "";
                            }
                          }}
                          disabled={isUserSectionBusy}
                        />
                        <Tooltip
                          content="Upload a new profile image"
                          side="top"
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={isUserSectionBusy}
                            aria-label="Upload avatar"
                          >
                            <Camera className="size-4" />
                          </Button>
                        </Tooltip>
                        {userSettings?.avatarUrl && (
                          <Tooltip
                            content="Remove your profile image"
                            side="top"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteAvatar()}
                              disabled={isUserSectionBusy}
                              aria-label="Remove avatar"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X className="size-4" />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {avatarError ? (
                      <p className="text-xs text-red-500">{avatarError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Upload an image smaller than {AVATAR_MAX_SIZE_MB}MB
                      </p>
                    )}

                    {/* Username */}
                    <div className="space-y-2 border-t border-border/30 pt-5">
                      <Label htmlFor="username-input">Username</Label>
                      <Input
                        id="username-input"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Your username"
                        disabled={isUserSectionBusy}
                        className="max-w-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        3 to 30 characters. Letters, numbers, underscores, and
                        hyphens. Shown across the app and in shared views.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-3 border-t border-border/30 pt-4">
                    <Button
                      type="button"
                      onClick={() => void handleSaveUserProfile()}
                      disabled={isUserSectionBusy}
                    >
                      {userSettingsSaving ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Save profile
                    </Button>
                    {profileMessage ? (
                      <p className="text-sm text-muted-foreground">
                        {profileMessage}
                      </p>
                    ) : null}
                  </div>
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
                onExportProject={handleExportProject}
                onViewExportHistory={handleViewExportHistory}
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
