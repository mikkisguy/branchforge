import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { handleSessionExpired, isUnauthorizedError } from "./session-expiry";

/**
 * Type guard to check if an error has a status property
 */
function isErrorWithStatus(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

/**
 * QueryClient configuration for BranchForge
 *
 * Configured for session-based auth application with appropriate caching,
 * retry logic, and refetch behavior.
 */
export function createAppQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isUnauthorizedError(error)) {
          handleSessionExpired(queryClient);
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isUnauthorizedError(error)) {
          handleSessionExpired(queryClient);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
        retry: (failureCount, error: unknown) => {
          // Don't retry 401/403 auth errors
          if (
            isErrorWithStatus(error) &&
            (error.status === 401 || error.status === 403)
          ) {
            return false;
          }

          return failureCount < 3;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return queryClient;
}

export const queryClient = createAppQueryClient();
