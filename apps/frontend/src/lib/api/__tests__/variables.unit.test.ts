/**
 * Variables API Unit Tests
 *
 * Tests for variable management API methods.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { variablesApi } from "../variables";
import type { CreateVariableBody, UpdateVariableBody } from "../variables";
import type { Variable } from "@branchforge/shared";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Variables API", () => {
  const mockVariable: Variable = {
    id: "var-1",
    projectId: "proj-1",
    key: "met_eileen",
    description: "Met Eileen",
    category: "flags",
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("List Variables", () => {
    it("should list all variables for a project", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variables: [mockVariable] }),
      });

      const result = await variablesApi.listVariables("proj-1");

      expect(result).toEqual([mockVariable]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/variables");
      expect(options?.method).toBe("GET");
    });

    it("should handle empty list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variables: [] }),
      });

      const result = await variablesApi.listVariables("proj-1");

      expect(result).toEqual([]);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variables: [] }),
      });

      await variablesApi.listVariables("proj-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(variablesApi.listVariables("proj-1")).rejects.toThrow(
        "Unauthorized"
      );
    });
  });

  describe("Get Variable", () => {
    it("should get variable by ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      const result = await variablesApi.getVariable("var-1");

      expect(result).toEqual(mockVariable);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/variables/var-1");
      expect(options?.method).toBe("GET");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.getVariable("var-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Variable not found" }),
      });

      await expect(variablesApi.getVariable("unknown")).rejects.toThrow(
        "Variable not found"
      );
    });
  });

  describe("Create Variable", () => {
    const validBody: CreateVariableBody = {
      key: "met_lucas",
      description: "Met Lucas",
      category: "flags",
    };

    it("should create variable successfully", async () => {
      const newVariable: Variable = {
        ...mockVariable,
        id: "var-2",
        key: "met_lucas",
        description: "Met Lucas",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: newVariable }),
      });

      const result = await variablesApi.createVariable("proj-1", validBody);

      expect(result).toEqual(newVariable);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/variables");
      expect(options?.method).toBe("POST");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.createVariable("proj-1", validBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(validBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.createVariable("proj-1", validBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should create with only required fields", async () => {
      const minimalBody = { key: "minimal_flag" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          variable: {
            id: "var-min",
            projectId: "proj-1",
            key: "minimal_flag",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        }),
      });

      const result = await variablesApi.createVariable("proj-1", minimalBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(minimalBody);
      expect(result.key).toBe("minimal_flag");
    });

    it("should handle validation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid variable data" }),
      });

      await expect(
        variablesApi.createVariable("proj-1", validBody)
      ).rejects.toThrow("Invalid variable data");
    });
  });

  describe("Update Variable", () => {
    const updateBody: UpdateVariableBody = {
      description: "Updated description",
      category: "story",
    };

    it("should update variable successfully", async () => {
      const updatedVariable: Variable = {
        ...mockVariable,
        description: "Updated description",
        category: "story",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: updatedVariable }),
      });

      const result = await variablesApi.updateVariable("var-1", updateBody);

      expect(result).toEqual(updatedVariable);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/variables/var-1");
      expect(options?.method).toBe("PATCH");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.updateVariable("var-1", updateBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(updateBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.updateVariable("var-1", updateBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle partial update", async () => {
      const partialBody = { description: "New description" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.updateVariable("var-1", partialBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(partialBody);
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Variable not found" }),
      });

      await expect(
        variablesApi.updateVariable("unknown", updateBody)
      ).rejects.toThrow("Variable not found");
    });
  });

  describe("Delete Variable", () => {
    it("should delete variable successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      const result = await variablesApi.deleteVariable("var-1");

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/variables/var-1");
      expect(options?.method).toBe("DELETE");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      await variablesApi.deleteVariable("var-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Variable not found" }),
      });

      await expect(variablesApi.deleteVariable("unknown")).rejects.toThrow(
        "Variable not found"
      );
    });

    it("should handle successful delete with no content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        // No body for 204
      });

      const result = await variablesApi.deleteVariable("var-1");

      expect(result).toBeUndefined();
    });
  });

  describe("Request Headers", () => {
    it("should set Content-Type header for POST/PATCH", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ variable: mockVariable }),
      });

      await variablesApi.createVariable("proj-1", {
        key: "test",
      });

      await variablesApi.updateVariable("var-1", {
        description: "Updated description",
      });

      expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );

      expect(mockFetch.mock.calls[1][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw generic error when response has no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => Promise.reject(new Error("JSON parse error")),
      });

      await expect(variablesApi.listVariables("proj-1")).rejects.toThrow(
        "Unknown error"
      );
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(variablesApi.getVariable("var-1")).rejects.toThrow(
        "Request failed with status 503"
      );
    });
  });
});
