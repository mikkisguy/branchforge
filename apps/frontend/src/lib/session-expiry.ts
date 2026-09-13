import type { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api/client";
import { clearCsrfToken } from "./api/csrf";
import { BASE_URL } from "./constants";

let handlingSessionExpiry = false;

type NavigateToLogin = (loginPath: string) => void;

let navigateToLogin: NavigateToLogin = (loginPath) => {
  window.location.assign(loginPath);
};

export function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.status === 401;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 401
  );
}

export function buildLoginPath(): string {
  return new URL("login", new URL(BASE_URL, window.location.origin)).pathname;
}

export function buildRegisterPath(): string {
  return new URL("register", new URL(BASE_URL, window.location.origin))
    .pathname;
}

export function isAuthRoute(pathname = window.location.pathname): boolean {
  return (
    pathname === buildLoginPath() || pathname === buildRegisterPath()
  );
}

export function handleSessionExpired(_queryClient: QueryClient): void {
  if (handlingSessionExpiry) {
    return;
  }

  if (isAuthRoute()) {
    clearCsrfToken();
    // Keep the failed query in the cache. ThemeProvider is mounted on auth
    // routes and queries user settings; clearing its observed 401 query here
    // removes it while the observer is still mounted, causing TanStack Query
    // to create and fetch it again in a tight loop.
    return;
  }

  handlingSessionExpiry = true;
  clearCsrfToken();
  // Navigation below reloads the document, which discards the query cache.
  // Do not clear it first: removing an observed query can recreate it and
  // trigger another request while the redirect is in progress.

  const loginPath = buildLoginPath();
  if (window.location.pathname !== loginPath) {
    navigateToLogin(loginPath);
  }
}

/** Resets session-expiry guard state between tests. */
export function resetSessionExpiryHandling(): void {
  handlingSessionExpiry = false;
}

/** Overrides login navigation in tests. */
export function setNavigateToLoginForTests(fn: NavigateToLogin): void {
  navigateToLogin = fn;
}

/** Restores default login navigation after tests. */
export function resetNavigateToLoginForTests(): void {
  navigateToLogin = (loginPath) => {
    window.location.assign(loginPath);
  };
}
