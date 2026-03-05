/**
 * useAuth Hook
 *
 * Provides authentication state and operations using TanStack Query.
 * Replaces the AuthContext with a more efficient query-based approach.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type PublicUser } from "@/lib/api/auth";
import { authKeys } from "@/lib/query-keys";

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for fetching the current user
 */
function getCurrentUserQueryOptions() {
  return {
    queryKey: authKeys.user(),
    queryFn: async () => {
      const response = await authApi.getMe();
      return response.user;
    },
    retry: false, // Don't retry auth failures
    staleTime: 5 * 60 * 1000, // 5 minutes
  };
}

// ============================================================================
// Hook
// ============================================================================

export interface UseAuthReturn {
  user: PublicUser | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const queryClient = useQueryClient();

  // Query for current user
  const { data: user, isLoading } = useQuery(getCurrentUserQueryOptions());

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      const response = await authApi.login({ email, password });
      return response.user;
    },
    onSuccess: (data) => {
      // Set the user data in cache
      queryClient.setQueryData(authKeys.user(), data);
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      const response = await authApi.register({ email, password });
      return response.user;
    },
    onSuccess: (data) => {
      // Set the user data in cache
      queryClient.setQueryData(authKeys.user(), data);
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await authApi.logout();
    },
    onSuccess: () => {
      // Clear all queries on logout
      queryClient.clear();
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const register = async (email: string, password: string) => {
    await registerMutation.mutateAsync({ email, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const refreshUser = async () => {
    await queryClient.invalidateQueries({ queryKey: authKeys.user() });
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };
}

