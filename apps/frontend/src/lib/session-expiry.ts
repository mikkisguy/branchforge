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
  return `${BASE_URL}login`.replace(/\/+/g, "/");
}

export function isAuthRoute(pathname = window.location.pathname): boolean {
  const loginPath = buildLoginPath();
  const registerPath = `${BASE_URL}register`.replace(/\/+/g, "/");
  return pathname === loginPath || pathname === registerPath;
}

export function handleSessionExpired(queryClient: QueryClient): void {
  if (handlingSessionExpiry) {
    return;
  }

  handlingSessionExpiry = true;
  clearCsrfToken();
  queryClient.clear();

  if (isAuthRoute()) {
    return;
  }

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
