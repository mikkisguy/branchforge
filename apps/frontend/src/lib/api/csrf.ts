/**
 * CSRF token client-side module.
 *
 * Stores the session-bound CSRF token issued by the backend and exposes
 * helpers to read it and refresh it after authentication events.
 *
 * Storage:
 * - The token is kept in module-level memory only. We deliberately do NOT
 *   persist it to localStorage: persisting would allow an XSS payload to
 *   steal it, defeating the purpose of CSRF protection. The token is
 *   re-fetched on each session via the `GET /csrf-token` endpoint.
 *
 * Lifecycle:
 * - The token is set automatically by the `useAuth` hook on successful
 *   login (the value comes back in the login response body) and via
 *   `loadCsrfToken` (which calls `GET /csrf-token`) for lazy restore
 *   when an existing session is detected on page load.
 * - The token is cleared on logout.
 *
 * The header `x-csrf-token` is added to unsafe (POST/PUT/PATCH/DELETE)
 * requests by every fetch wrapper in the app via `getCsrfHeader()`.
 *
 * See GitHub issue #206 for the design.
 */

import { API_BASE } from "./client";

/**
 * Methods that mutate server state and therefore require a CSRF header.
 * Listed explicitly to match the backend hook in `csrf.middleware.ts`.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The header name used by both client and server. Lowercase to match
 * HTTP/2 convention and Fastify's header normalization.
 */
export const CSRF_HEADER = "x-csrf-token";

/**
 * Endpoint that returns the session's current CSRF token. Must be
 * auth-required; the backend route is at `${API_BASE}/csrf-token`.
 */
const CSRF_TOKEN_ENDPOINT = `${API_BASE}/csrf-token`;

// ============================================================================
// Token Storage
// ============================================================================

let currentToken: string | null = null;
let inflightFetch: Promise<string | null> | null = null;

/**
 * Return the currently cached CSRF token, if any. Does not fetch.
 */
export function getCsrfToken(): string | null {
  return currentToken;
}

/**
 * Set the in-memory token. Called by `useAuth` on login and by
 * `loadCsrfToken` after a successful lazy fetch.
 */
export function setCsrfToken(token: string | null): void {
  currentToken = token;
}

/**
 * Clear the in-memory token. Called on logout.
 */
export function clearCsrfToken(): void {
  currentToken = null;
  inflightFetch = null;
}

// ============================================================================
// Lazy Fetch
// ============================================================================

/**
 * Fetch the current session's CSRF token from the backend and cache it.
 *
 * Safe to call multiple times in flight: concurrent calls share the
 * same underlying `fetch` via an in-flight promise so we do not
 * produce duplicate requests.
 *
 * Returns the token on success, or `null` if the user is not
 * authenticated (e.g. 401 from the server).
 */
export async function loadCsrfToken(
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (inflightFetch) {
    return inflightFetch;
  }
  inflightFetch = (async () => {
    try {
      const response = await fetchImpl(CSRF_TOKEN_ENDPOINT, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        // 401/403/anything else: no token. Caller will see null.
        return null;
      }
      const body = (await response.json()) as { csrfToken?: string };
      if (typeof body.csrfToken === "string" && body.csrfToken.length > 0) {
        currentToken = body.csrfToken;
        return body.csrfToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflightFetch = null;
    }
  })();
  return inflightFetch;
}

// ============================================================================
// Header Builder
// ============================================================================

/**
 * Build a `HeadersInit` (or undefined) that adds the `x-csrf-token`
 * header to a request if the method is unsafe and we have a token
 * cached.
 *
 * Used by every fetch wrapper in the app. The returned value is
 * suitable for spreading into a `headers` object alongside other
 * caller-supplied headers.
 *
 * Returns `undefined` for safe methods or when no token is available,
 * so callers can use `...(csrfHeader ?? {})` without bloat.
 *
 * The token is NOT added for FormData bodies, since the backend
 * exempts multipart and urlencoded requests from CSRF checks.
 */
export function getCsrfHeader(
  method: string,
  body: BodyInit | null | undefined
): Record<string, string> | undefined {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) {
    return undefined;
  }
  if (body instanceof FormData) {
    return undefined;
  }
  if (!currentToken) {
    return undefined;
  }
  return { [CSRF_HEADER]: currentToken };
}

/**
 * Whether a request with the given method/body needs the CSRF token.
 * Exposed for tests and for the `useAuth` hook to know when to lazy-load
 * the token before firing the request.
 */
export function csrfTokenRequired(
  method: string,
  body: BodyInit | null | undefined
): boolean {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) {
    return false;
  }
  if (body instanceof FormData) {
    return false;
  }
  return true;
}
