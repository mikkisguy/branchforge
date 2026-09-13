import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useMutation } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "../query-client";
import { ApiRequestError } from "../api/client";
import { clearCsrfToken, getCsrfToken, setCsrfToken } from "../api/csrf";
import {
  resetNavigateToLoginForTests,
  resetSessionExpiryHandling,
  setNavigateToLoginForTests,
} from "../session-expiry";

describe("query-client", () => {
  describe("mutation defaults", () => {
    it("sets default mutations.retry to false", () => {
      const client = createAppQueryClient();
      expect(client.getDefaultOptions().mutations?.retry).toBe(false);
      client.clear();
    });

    it("retains the existing query retry policy", () => {
      const client = createAppQueryClient();
      const retry = client.getDefaultOptions().queries?.retry;
      expect(typeof retry).toBe("function");

      const retryFn = retry as (count: number, err: unknown) => boolean;
      expect(retryFn(0, new Error("network"))).toBe(true);
      expect(retryFn(2, new Error("network"))).toBe(true);
      expect(retryFn(3, new Error("network"))).toBe(false);
      expect(retryFn(0, new ApiRequestError("Unauthorized", 401, {}))).toBe(
        false
      );
      expect(retryFn(0, new ApiRequestError("Forbidden", 403, {}))).toBe(false);

      client.clear();
    });
  });

  describe("session expiry", () => {
    let navigateSpy: (loginPath: string) => void;
    let originalPathname: string;

    beforeEach(() => {
      clearCsrfToken();
      resetSessionExpiryHandling();
      resetNavigateToLoginForTests();
      setCsrfToken("session-token");

      navigateSpy = vi.fn<(loginPath: string) => void>();
      setNavigateToLoginForTests(navigateSpy);

      originalPathname = window.location.pathname;
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          ...window.location,
          pathname: "/projects",
          assign: vi.fn(),
        },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          ...window.location,
          pathname: originalPathname,
        },
      });
      resetSessionExpiryHandling();
      resetNavigateToLoginForTests();
      clearCsrfToken();
    });

    it("clears cache, CSRF token, and navigates on query 401", async () => {
      const client = createAppQueryClient();
      client.setQueryData(["cached"], { value: 1 });

      await expect(
        client.fetchQuery({
          queryKey: ["protected"],
          queryFn: () =>
            Promise.reject(new ApiRequestError("Unauthorized", 401, {})),
          retry: false,
        })
      ).rejects.toThrow("Unauthorized");

      expect(client.getQueryData(["cached"])).toBeUndefined();
      expect(getCsrfToken()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith("/login");
      client.clear();
    });

    it("clears cache, CSRF token, and navigates on mutation 401", async () => {
      const client = createAppQueryClient();
      client.setQueryData(["cached"], { value: 1 });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () =>
          useMutation({
            mutationFn: () =>
              Promise.reject(new ApiRequestError("Unauthorized", 401, {})),
          }),
        { wrapper }
      );

      await expect(result.current.mutateAsync()).rejects.toThrow(
        "Unauthorized"
      );

      await waitFor(() => {
        expect(client.getQueryData(["cached"])).toBeUndefined();
      });
      expect(getCsrfToken()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith("/login");
      client.clear();
    });

    it("does not navigate when already on an auth route", async () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          ...window.location,
          pathname: "/login",
          assign: vi.fn(),
        },
      });

      const client = createAppQueryClient();

      await expect(
        client.fetchQuery({
          queryKey: ["auth-check"],
          queryFn: () =>
            Promise.reject(new ApiRequestError("Unauthorized", 401, {})),
          retry: false,
        })
      ).rejects.toThrow("Unauthorized");

      expect(navigateSpy).not.toHaveBeenCalled();
      client.clear();
    });

    it("handles repeated 401 responses only once", async () => {
      const client = createAppQueryClient();

      const failingQuery = () =>
        client.fetchQuery({
          queryKey: ["protected", Math.random()],
          queryFn: () =>
            Promise.reject(new ApiRequestError("Unauthorized", 401, {})),
          retry: false,
        });

      await expect(failingQuery()).rejects.toThrow("Unauthorized");
      await expect(failingQuery()).rejects.toThrow("Unauthorized");

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      client.clear();
    });
  });
});
