/**
 * useSettings Hook
 *
 * Provides settings state and operations using TanStack Query.
 * Replaces the SettingsContext with optimistic updates via onMutate/onError.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/settings";
import { authKeys, settingsKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { PublicUser } from "@/lib/api/auth";

// ============================================================================
// Types
// ============================================================================

export interface UseSettingsReturn {
  signUpsEnabled: boolean | undefined;
  isLoading: boolean;
  isSaving: boolean;
  updateSignUpsSetting: (enabled: boolean) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access settings with optimistic updates
 *
 * Note: This hook has a dependency on useAuth for authorization checks.
 * The user role check is preserved from the original SettingsContext.
 */
export function useSettings(): UseSettingsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Get current user from auth query cache
  const user = queryClient.getQueryData<PublicUser>(authKeys.user()) ?? null;

  // Query for sign-ups status
  const { data: signUpStatus, isLoading } = useQuery({
    queryKey: settingsKeys.signUps(),
    queryFn: async () => {
      const status = await settingsApi.getSignUpStatus();
      return status.enabled;
    },
    // Fail open - if we can't fetch the setting, allow signups
    retry: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Update sign-ups setting mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (user?.role !== "OWNER") {
        throw new Error("Only administrators can change this setting");
      }
      await settingsApi.updateSetting("sign_ups_enabled", enabled);
      return enabled;
    },
    onMutate: async (enabled) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: settingsKeys.signUps() });

      // Snapshot the previous value
      const previousValue = queryClient.getQueryData<boolean>(
        settingsKeys.signUps()
      );

      // Optimistically update to the new value
      queryClient.setQueryData<boolean>(settingsKeys.signUps(), enabled);

      // Return a context object with the previous value
      return { previousValue };
    },
    onError: (_error, _variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData<boolean>(
          settingsKeys.signUps(),
          context.previousValue
        );
      }
      toast.error(
        "Failed to update setting. The original value has been restored.",
        "Error"
      );
    },
    onSuccess: (enabled) => {
      toast.success(
        enabled ? "Sign-ups have been enabled" : "Sign-ups have been disabled",
        "Setting saved"
      );
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: settingsKeys.signUps() });
    },
  });

  return {
    signUpsEnabled: signUpStatus,
    isLoading,
    isSaving: updateMutation.isPending,
    updateSignUpsSetting: (enabled: boolean) => {
      return updateMutation.mutateAsync(enabled).then(() => undefined);
    },
  };
}
