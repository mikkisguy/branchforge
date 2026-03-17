/**
 * API Client Unit Tests
 *
 * Tests for the shared HTTP client functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { request, requestVoid, type ApiError } from "../client";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("API Client", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("request function", () => {
    it("should make GET request successfully", async () => {
      const mockData = { message: "Success" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await request("/test");

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/test");
      expect(options?.method).toBeUndefined(); // GET is default
    });

    it("should make POST request with body", async () => {
      const requestBody = { name: "Test" };
      const mockData = { id: "1", ...requestBody };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await request("/test", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      expect(result).toEqual(mockData);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.method).toBe("POST");
      expect(options?.body).toBe(JSON.stringify(requestBody));
    });

    it("should include credentials in all requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await request("/test");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should set Content-Type header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await request("/test");

      expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
    });

    it("should allow custom headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await request("/test", {
        headers: {
          "X-Custom-Header": "custom-value",
        },
      });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers).toHaveProperty("X-Custom-Header", "custom-value");
      expect(headers).toHaveProperty("Content-Type", "application/json");
    });

    it("should handle 204 No Content response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      const result = await request("/test");

      expect(result).toBeUndefined();
    });

    it("should throw error on non-OK response", async () => {
      const error: ApiError = { error: "Not found" };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => error,
      });

      await expect(request("/test")).rejects.toThrow("Not found");
    });

    it("should throw generic error when error response has no message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => Promise.reject(new Error("JSON parse error")),
      });

      await expect(request("/test")).rejects.toThrow("Unknown error");
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(request("/test")).rejects.toThrow(
        "Request failed with status 503"
      );
    });

    it("should throw error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(request("/test")).rejects.toThrow("Network error");
    });

    it("should throw error on JSON parse failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => Promise.reject(new Error("Invalid JSON")),
      });

      await expect(request("/test")).rejects.toThrow("Failed to parse response as JSON");
    });

    it("should use API base URL from environment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await request("/test");

      const [url] = mockFetch.mock.calls[0];
      // URL should contain either /api or /api/api depending on environment
      expect(url).toMatch(/\/(|)\/api/);
    });
  });

  describe("requestVoid function", () => {
    it("should make DELETE request successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      const result = await requestVoid("/test", { method: "DELETE" });

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/test");
      expect(options?.method).toBe("DELETE");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      await requestVoid("/test");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should set Content-Type header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      await requestVoid("/test");

      expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
    });

    it("should throw error on non-OK response", async () => {
      const error: ApiError = { error: "Unauthorized" };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => error,
      });

      await expect(requestVoid("/test")).rejects.toThrow("Unauthorized");
    });

    it("should throw generic error when error response has no message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => Promise.reject(new Error("JSON parse error")),
      });

      await expect(requestVoid("/test")).rejects.toThrow("Unknown error");
    });

    it("should throw error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(requestVoid("/test")).rejects.toThrow("Network error");
    });
  });

  describe("HTTP Methods", () => {
    it("should support PUT method", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updated: true }),
      });

      const result = await request("/test", { method: "PUT" });

      expect(result).toEqual({ updated: true });
      expect(mockFetch.mock.calls[0][1]?.method).toBe("PUT");
    });

    it("should support PATCH method", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ patched: true }),
      });

      const result = await request("/test", { method: "PATCH" });

      expect(result).toEqual({ patched: true });
      expect(mockFetch.mock.calls[0][1]?.method).toBe("PATCH");
    });

    it("should support OPTIONS method", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ allow: ["GET", "POST"] }),
      });

      const result = await request("/test", { method: "OPTIONS" });

      expect(result).toEqual({ allow: ["GET", "POST"] });
      expect(mockFetch.mock.calls[0][1]?.method).toBe("OPTIONS");
    });
  });

  describe("Response Status Codes", () => {
    it("should handle 200 OK", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: "success" }),
      });

      const result = await request("/test");
      expect(result).toEqual({ data: "success" });
    });

    it("should handle 201 Created", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: "new", created: true }),
      });

      const result = await request("/test");
      expect(result).toEqual({ id: "new", created: true });
    });

    it("should handle 400 Bad Request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Bad request" }),
      });

      await expect(request("/test")).rejects.toThrow("Bad request");
    });

    it("should handle 401 Unauthorized", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(request("/test")).rejects.toThrow("Unauthorized");
    });

    it("should handle 403 Forbidden", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      });

      await expect(request("/test")).rejects.toThrow("Forbidden");
    });

    it("should handle 404 Not Found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      });

      await expect(request("/test")).rejects.toThrow("Not found");
    });

    it("should handle 409 Conflict", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "Conflict" }),
      });

      await expect(request("/test")).rejects.toThrow("Conflict");
    });

    it("should handle 500 Internal Server Error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      await expect(request("/test")).rejects.toThrow("Internal server error");
    });

    it("should handle 503 Service Unavailable", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: "Service unavailable" }),
      });

      await expect(request("/test")).rejects.toThrow("Service unavailable");
    });
  });

  describe("Type Safety", () => {
    it("should return typed data for successful request", async () => {
      interface TestResponse {
        id: string;
        name: string;
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", name: "Test" }),
      });

      const result = await request<TestResponse>("/test");

      // Type assertion should work
      expect(result.id).toBe("1");
      expect(result.name).toBe("Test");
    });
  });
});
