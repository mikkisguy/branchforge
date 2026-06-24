/**
 * useUserSettings Hook
 *
 * Provides user settings and operations using TanStack Query.
 * Manages avatar upload, profile updates, and theme persistence.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userSettingsApi } from "@/lib/api/user-settings";
import { userSettingsKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";

// ============================================================================
// Types
// ============================================================================

export interface UseUserSettingsReturn {
  settings: {
    avatarUrl: string | null;
    username: string | null;
    language: string;
    theme: string;
    dailyWritingGoal: number | null;
    dailyWordResetHour: number;
    dailyWordCounts: Array<{ date: string; count: number }>;
    timezone: string;
  } | null;
  isLoading: boolean;
  isSaving: boolean;
  isUploading: boolean;
  updateProfile: (
    params: {
      username?: string;
      language?: string;
      theme?: string;
    },
    options?: { silent?: boolean }
  ) => Promise<void>;
  uploadAvatar: (file: File) => void;
  deleteAvatar: () => void;
  refetch: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access and manage user settings
 */
export function useUserSettings(): UseUserSettingsReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for user settings
  const { data: settings, isLoading } = useQuery({
    queryKey: userSettingsKeys.settings(),
    queryFn: userSettingsApi.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: (vars: {
      username?: string;
      language?: string;
      theme?: string;
      silent?: boolean;
    }) => {
      const { silent: _silent, ...data } = vars;
      return userSettingsApi.updateProfile(data);
    },
    onMutate: async (newData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: userSettingsKeys.settings(),
      });

      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(
        userSettingsKeys.settings()
      );

      // Optimistically update to the new value
      queryClient.setQueryData(userSettingsKeys.settings(), (prev: unknown) => {
        const previous = prev as UseUserSettingsReturn["settings"];
        if (!previous) return previous;

        return {
          ...previous,
          username: newData.username ?? previous.username,
          language: newData.language ?? previous.language,
          theme: newData.theme ?? previous.theme,
        };
      });

      // Return a context object with the previous value
      return { previousValue };
    },
    onError: (_error, variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousValue) {
        queryClient.setQueryData(
          userSettingsKeys.settings(),
          context.previousValue
        );
      }
      if (!variables.silent) {
        toast.error(
          "Failed to update profile settings. The original value has been restored.",
          "Error"
        );
      }
    },
    onSuccess: (_data, variables) => {
      if (!variables.silent) {
        toast.success("Profile settings updated", "Settings saved");
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({
        queryKey: userSettingsKeys.settings(),
      });
    },
  });

  // Upload avatar mutation
  const uploadMutation = useMutation({
    mutationFn: userSettingsApi.uploadAvatar,
    onSuccess: (data) => {
      // Update the settings cache with the new avatar URL
      queryClient.setQueryData(userSettingsKeys.settings(), (prev: unknown) => {
        const previous = prev as UseUserSettingsReturn["settings"];
        if (!previous) return previous;

        return {
          ...previous,
          avatarUrl: data.avatarUrl,
        };
      });
      toast.success("Avatar uploaded successfully", "Success");
    },
    onError: () => {
      toast.error("Failed to upload avatar. Please try again.", "Error");
    },
  });

  // Delete avatar mutation
  const deleteMutation = useMutation({
    mutationFn: userSettingsApi.deleteAvatar,
    onSuccess: () => {
      // Update the settings cache with null avatar
      queryClient.setQueryData(userSettingsKeys.settings(), (prev: unknown) => {
        const previous = prev as UseUserSettingsReturn["settings"];
        if (!previous) return previous;

        return {
          ...previous,
          avatarUrl: null,
        };
      });
      toast.success("Avatar removed", "Success");
    },
    onError: () => {
      toast.error("Failed to remove avatar. Please try again.", "Error");
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({
      queryKey: userSettingsKeys.settings(),
    });
  };

  return {
    settings: settings ?? null,
    isLoading,
    isSaving: updateMutation.isPending,
    isUploading: uploadMutation.isPending || deleteMutation.isPending,
    updateProfile: async (params, options) => {
      await updateMutation.mutateAsync({
        ...params,
        silent: options?.silent,
      });
    },
    uploadAvatar: (file) => {
      uploadMutation.mutate(file);
    },
    deleteAvatar: () => {
      deleteMutation.mutate();
    },
    refetch,
  };
}
