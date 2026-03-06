/**
 * API Client
 *
 * Shared HTTP client for API requests with consistent error handling,
 * credentials management, and response type safety.
 */

const API_BASE =
  import.meta.env.VITE_API_ENV === "development" ? "/api/api" : "/api";

export interface ApiError {
  error: string;
}

// ============================================================================
// API Request Handler
// ============================================================================

/**
 * Internal fetch implementation shared by all request variants
 */
async function fetchInternal(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ApiError = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      error.error || `Request failed with status ${response.status}`,
    );
  }

  return response;
}

// Overload for endpoints that return void (204 No Content)
export async function request(
  endpoint: string,
  options?: RequestInit,
): Promise<void>;

// Overload for endpoints that return data
export async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T>;

// Implementation
export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T | void> {
  const response = await fetchInternal(endpoint, options);

  // For 204 No Content responses, return void
  if (response.status === 204) {
    return;
  }

  return response.json().catch(() => {
    throw new Error("Failed to parse response as JSON");
  });
}

/**
 * Request handler for endpoints that return 204 No Content.
 *
 * Use this for DELETE, PUT, or POST endpoints that don't return a response body.
 * Provides clear intent and avoids the need for explicit type parameters.
 *
 * @example
 * await requestVoid('/projects/123', { method: 'DELETE' });
 */
export async function requestVoid(
  endpoint: string,
  options: RequestInit = {},
): Promise<void> {
  await fetchInternal(endpoint, options);
  // No need to check 204 status - fetchInternal already validates the response
}

