import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  buildLoginPath,
  buildRegisterPath,
  handleSessionExpired,
  isAuthRoute,
  resetNavigateToLoginForTests,
  resetSessionExpiryHandling,
  setNavigateToLoginForTests,
} from "@/lib/session-expiry";
import { clearCsrfToken, setCsrfToken } from "@/lib/api/csrf";

vi.mock("@/lib/constants", () => ({
  BASE_URL: "/branchforge/",
}));

describe("session-expiry", () => {
  let navigateSpy: ReturnType<typeof vi.fn<(loginPath: string) => void>>;
  let originalPathname: string;

  beforeEach(() => {
    clearCsrfToken();
    resetSessionExpiryHandling();
    resetNavigateToLoginForTests();
    setCsrfToken("session-token");

    navigateSpy = vi.fn<(loginPath: string) => void>();
    setNavigateToLoginForTests(navigateSpy);

    originalPathname = window.location.pathname;
    window.history.replaceState({}, "", "/branchforge/projects");
  });

  afterEach(() => {
    window.history.replaceState({}, "", originalPathname);
    resetSessionExpiryHandling();
    resetNavigateToLoginForTests();
    clearCsrfToken();
  });

  it("builds auth paths from a normalized subpath base URL", () => {
    expect(buildLoginPath()).toBe("/branchforge/login");
    expect(buildRegisterPath()).toBe("/branchforge/register");
    expect(isAuthRoute("/branchforge/login")).toBe(true);
    expect(isAuthRoute("/branchforge/register")).toBe(true);
    expect(isAuthRoute("/branchforge/projects")).toBe(false);
  });

  it("does not clear observed queries or set the expiry guard on an auth route", () => {
    window.history.replaceState({}, "", "/branchforge/login");

    const queryClient = new QueryClient();
    queryClient.setQueryData(["cached"], { value: 1 });

    handleSessionExpired(queryClient);
    expect(queryClient.getQueryData(["cached"])).toEqual({ value: 1 });
    expect(navigateSpy).not.toHaveBeenCalled();

    queryClient.setQueryData(["cached"], { value: 2 });
    handleSessionExpired(queryClient);
    expect(queryClient.getQueryData(["cached"])).toEqual({ value: 2 });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("navigates to the normalized login path from a protected route", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["cached"], { value: 1 });

    handleSessionExpired(queryClient);

    expect(navigateSpy).toHaveBeenCalledWith("/branchforge/login");
    expect(queryClient.getQueryData(["cached"])).toEqual({ value: 1 });
  });
});
