import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
} from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { SettingsSection } from "@/components/ide-shared/SettingsLayout";
import { WritingGoalSettings } from "@/components/write-mode/WritingGoalSettings";
import { AVATAR_MAX_SIZE_MB } from "@branchforge/shared";

interface SettingsModalUserTabProps {
  user: { email?: string | null } | null | undefined;
}

export function SettingsModalUserTab({ user }: SettingsModalUserTabProps) {
  const {
    settings: userSettings,
    isLoading: userSettingsLoading,
    isSaving: userSettingsSaving,
    isUploading: userSettingsUploading,
    updateProfile: updateUserProfile,
    uploadAvatar,
    deleteAvatar,
  } = useUserSettings();

  const [username, setUsername] = useState(userSettings?.username ?? "");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isUserSectionBusy =
    userSettingsLoading || userSettingsSaving || userSettingsUploading;

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

  return (
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
                    {(userSettings?.username ?? user?.email?.[0] ?? "U")
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
                aria-label="Choose avatar image"
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
              <Tooltip content="Upload a new profile image" side="top">
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
                <Tooltip content="Remove your profile image" side="top">
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
          <div className="space-y-2 border-t border-border pt-5">
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
              3 to 30 characters. Letters, numbers, underscores, and hyphens.
              Shown across the app and in shared views.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
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
            <p className="text-sm text-muted-foreground">{profileMessage}</p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="Writing Goals">
        <WritingGoalSettings />
      </SettingsSection>
    </div>
  );
}
