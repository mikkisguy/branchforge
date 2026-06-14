/**
 * useAuth Hook
 *
 * Provides authentication state and operations using TanStack Query.
 * Replaces the AuthContext with a more efficient query-based approach.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type PublicUser } from "@/lib/api/auth";
import { authKeys } from "@/lib/query-keys";
import { setCsrfToken, clearCsrfToken, loadCsrfToken } from "@/lib/api/csrf";

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
      if (response.csrfToken) {
        setCsrfToken(response.csrfToken);
      }
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

  // If the user query resolves successfully (i.e. the browser already
  // has a valid session cookie), eagerly fetch the CSRF token so the
  // first state-changing request can include it. We do not block on
  // this: state-changing callers can fall back to `loadCsrfToken` on
  // a 403 response if needed.
  useEffect(() => {
    if (user) {
      void loadCsrfToken();
    }
  }, [user]);

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
      // Cache the CSRF token issued at login. The backend puts the
      // token in both the response body and the session; the body
      // value is preferred so the client can start using it
      // immediately without a round-trip to /csrf-token.
      if (response.csrfToken) {
        setCsrfToken(response.csrfToken);
      }
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
      // Ensure the CSRF token is cached before sending the logout
      // request. If the eager fetch in the useEffect below hasn't
      // completed yet (e.g. user clicks logout immediately after page
      // load on a slow network), the POST /logout would get a 403.
      // loadCsrfToken is a no-op when the token is already cached and
      // coalesces concurrent calls, so this is cheap.
      await loadCsrfToken();
      await authApi.logout();
    },
    onSuccess: () => {
      // Clear all queries on logout
      queryClient.clear();
      // Drop the in-memory CSRF token so subsequent requests don't
      // carry a stale one.
      clearCsrfToken();
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
