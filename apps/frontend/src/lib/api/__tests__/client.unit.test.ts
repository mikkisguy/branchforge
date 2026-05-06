/**
 * API Client Unit Tests
 *
 * Tests for the shared HTTP client functionality.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  request,
  requestVoid,
  getApiErrorMessage,
  type ApiError,
} from "../client";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getApiErrorMessage", () => {
    it("prefers message over error field", () => {
      const result = getApiErrorMessage(
        {
          error: "Bad Request",
          message: "Invalid project data",
          statusCode: 400,
        },
        400
      );

      expect(result).toBe("Invalid project data");
    });

    it("falls back to error field when message is missing", () => {
      const result = getApiErrorMessage({ error: "Unauthorized" }, 401);

      expect(result).toBe("Unauthorized");
    });

    it("falls back to status-based message when payload is empty", () => {
      const result = getApiErrorMessage({}, 503);

      expect(result).toBe("Request failed with status 503");
    });

    it("returns first validation issue when details include zod issues", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          message: "Invalid request data",
          details: {
            issues: [
              {
                path: ["name"],
                message: "This field is required",
              },
            ],
          },
        },
        400
      );

      expect(result).toBe("Name: This field is required");
    });

    it("handles nested validation issue paths", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          details: {
            issues: [
              {
                path: ["project", "name"],
                message: "Must be 200 characters or less",
              },
            ],
          },
        },
        400
      );

      expect(result).toBe("Project.name: Must be 200 characters or less");
    });

    it("falls back to message when details.issues is an empty array", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          message: "Validation failed",
          details: {
            issues: [],
          },
        },
        400
      );

      expect(result).toBe("Validation failed");
    });

    it("falls back to error when details.issues is empty and message is missing", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          details: {
            issues: [],
          },
        },
        400
      );

      expect(result).toBe("ValidationError");
    });

    it("falls back to status-based default when details.issues is empty and both message and error are missing", () => {
      const result = getApiErrorMessage(
        {
          details: {
            issues: [],
          },
        },
        400
      );

      expect(result).toBe("Request failed with status 400");
    });

    it("uses 'Field' prefix when issue has empty path array", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          details: {
            issues: [
              {
                path: [],
                message: "This field is required",
              },
            ],
          },
        },
        400
      );

      expect(result).toBe("Field: This field is required");
    });

    it("safely falls back when details is present but issues is null", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          message: "Validation failed",
          details: {
            issues: null,
          },
        },
        400
      );

      expect(result).toBe("Validation failed");
    });

    it("safely falls back when details is present but issues is an object", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          message: "Invalid data",
          details: {
            issues: { foo: "bar" },
          },
        },
        400
      );

      expect(result).toBe("Invalid data");
    });

    it("safely falls back when details is present but issues is a string", () => {
      const result = getApiErrorMessage(
        {
          error: "ValidationError",
          details: {
            issues: "not-an-array",
          },
        },
        400
      );

      expect(result).toBe("ValidationError");
    });

    it("safely falls back to status-based default when details has malformed issues and no message/error", () => {
      const result = getApiErrorMessage(
        {
          details: {
            issues: null,
          },
        },
        503
      );

      expect(result).toBe("Request failed with status 503");
    });
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

    it("should not set Content-Type header without request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await request("/test");

      expect(mockFetch.mock.calls[0][1]?.headers).toBeUndefined();
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
      expect(headers).not.toHaveProperty("Content-Type");
    });

    it("should set Content-Type when custom headers do not include it and body is present", async () => {
      const requestBody = { name: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1" }),
      });

      await request("/test", {
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: {
          "X-Custom-Header": "custom-value",
        },
      });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers).toHaveProperty("Content-Type", "application/json");
      expect(headers).toHaveProperty("X-Custom-Header", "custom-value");
    });

    it("should preserve custom Content-Type header when explicitly provided", async () => {
      const requestBody = { name: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1" }),
      });

      await request("/test", {
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "text/plain",
        },
      });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers).toHaveProperty("Content-Type", "text/plain");
    });

    it("should preserve custom Content-Type when headers is a Headers instance", async () => {
      const requestBody = { name: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1" }),
      });

      await request("/test", {
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: new Headers({
          "Content-Type": "text/plain",
          "X-Custom": "v",
        }),
      });

      const headers = new Headers(
        mockFetch.mock.calls[0][1]?.headers as HeadersInit
      );
      expect(headers.get("content-type")).toBe("text/plain");
      expect(headers.get("x-custom")).toBe("v");
    });

    it("should preserve tuple-array Content-Type header", async () => {
      const requestBody = { name: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1" }),
      });

      await request("/test", {
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: [
          ["content-type", "text/plain"],
          ["x-custom", "v"],
        ],
      });

      const headers = new Headers(
        mockFetch.mock.calls[0][1]?.headers as HeadersInit
      );
      expect(headers.get("content-type")).toBe("text/plain");
      expect(headers.get("x-custom")).toBe("v");
    });

    it("should set Content-Type header when request has JSON body", async () => {
      const requestBody = { name: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1" }),
      });

      await request("/test", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
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

    it("should throw generic error when JSON parsing of error response fails", async () => {
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

      await expect(request("/test")).rejects.toThrow(
        "Failed to parse response as JSON"
      );
    });

    it("should use deterministic API base URL from environment", async () => {
      vi.stubEnv("VITE_API_ENV", "development");

      try {
        vi.resetModules();
        const { request: requestWithStubbedEnv } = await import("../client");

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

        await requestWithStubbedEnv("/endpoint");

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe(
          `${import.meta.env.VITE_API_BASE_URL ?? "/api"}/endpoint`
        );
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
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

    it("should not set Content-Type header without request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      await requestVoid("/test");

      expect(mockFetch.mock.calls[0][1]?.headers).toBeUndefined();
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

    it("should throw generic error when JSON parse fails", async () => {
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
