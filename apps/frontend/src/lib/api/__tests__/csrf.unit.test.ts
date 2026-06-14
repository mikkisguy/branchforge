/**
 * CSRF Token Module Unit Tests
 *
 * Verifies the in-memory token store, lazy fetch, and header builder.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  loadCsrfToken,
  getCsrfHeader,
  csrfTokenRequired,
  CSRF_HEADER,
} from "../csrf";

// Mock the global fetch used by loadCsrfToken.
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("CSRF token module", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.clearAllMocks();
  });

  describe("in-memory store", () => {
    it("starts with no token", () => {
      expect(getCsrfToken()).toBeNull();
    });

    it("setCsrfToken stores a value retrievable via getCsrfToken", () => {
      setCsrfToken("abc");
      expect(getCsrfToken()).toBe("abc");
    });

    it("clearCsrfToken removes the value", () => {
      setCsrfToken("abc");
      clearCsrfToken();
      expect(getCsrfToken()).toBeNull();
    });
  });

  describe("loadCsrfToken", () => {
    it("fetches /csrf-token and caches the response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: "fresh-token" }),
      });

      const token = await loadCsrfToken();
      expect(token).toBe("fresh-token");
      expect(getCsrfToken()).toBe("fresh-token");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/csrf-token"),
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        })
      );
    });

    it("returns null on 401 (unauthenticated)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      const token = await loadCsrfToken();
      expect(token).toBeNull();
      expect(getCsrfToken()).toBeNull();
    });

    it("coalesces concurrent calls into a single fetch", async () => {
      let resolveFn: (value: unknown) => void = () => {};
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFn = resolve;
        })
      );

      const p1 = loadCsrfToken();
      const p2 = loadCsrfToken();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolveFn({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: "once" }),
      });
      const [t1, t2] = await Promise.all([p1, p2]);
      expect(t1).toBe("once");
      expect(t2).toBe("once");
    });

    it("returns null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));
      const token = await loadCsrfToken();
      expect(token).toBeNull();
    });
  });

  describe("getCsrfHeader", () => {
    it("returns undefined for safe methods when token is set", () => {
      setCsrfToken("x");
      expect(getCsrfHeader("GET", null)).toBeUndefined();
      expect(getCsrfHeader("HEAD", null)).toBeUndefined();
      expect(getCsrfHeader("OPTIONS", null)).toBeUndefined();
    });

    it("returns the header for unsafe methods when token is set", () => {
      setCsrfToken("the-token");
      expect(getCsrfHeader("POST", JSON.stringify({}))).toEqual({
        [CSRF_HEADER]: "the-token",
      });
      expect(getCsrfHeader("PUT", JSON.stringify({}))).toEqual({
        [CSRF_HEADER]: "the-token",
      });
      expect(getCsrfHeader("PATCH", JSON.stringify({}))).toEqual({
        [CSRF_HEADER]: "the-token",
      });
      expect(getCsrfHeader("DELETE", null)).toEqual({
        [CSRF_HEADER]: "the-token",
      });
    });

    it("returns undefined for unsafe methods when no token is cached", () => {
      expect(getCsrfHeader("POST", JSON.stringify({}))).toBeUndefined();
    });

    it("returns undefined for FormData bodies (backend exempts multipart)", () => {
      setCsrfToken("x");
      const formData = new FormData();
      formData.append("key", "value");
      expect(getCsrfHeader("POST", formData)).toBeUndefined();
    });
  });

  describe("csrfTokenRequired", () => {
    it("is true for unsafe non-FormData methods", () => {
      expect(csrfTokenRequired("POST", JSON.stringify({}))).toBe(true);
      expect(csrfTokenRequired("PUT", null)).toBe(true);
    });

    it("is false for safe methods", () => {
      expect(csrfTokenRequired("GET", null)).toBe(false);
    });

    it("is false for FormData bodies", () => {
      expect(csrfTokenRequired("POST", new FormData())).toBe(false);
    });
  });
});
