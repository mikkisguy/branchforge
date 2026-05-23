/**
 * State Variables API Unit Tests
 *
 * Tests for state variable management API methods.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stateVariablesApi } from "../state-variables";
import type {
  CreateStateVariableBody,
  UpdateStateVariableBody,
} from "../state-variables";
import type { Variable } from "@branchforge/shared";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("State Variables API", () => {
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

  describe("List State Variables", () => {
    it("should list all state variables for a project", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariables: [mockVariable] }),
      });

      const result = await stateVariablesApi.listStateVariables("proj-1");

      expect(result).toEqual([mockVariable]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/state-variables");
      expect(options?.method).toBe("GET");
    });

    it("should handle empty list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariables: [] }),
      });

      const result = await stateVariablesApi.listStateVariables("proj-1");

      expect(result).toEqual([]);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariables: [] }),
      });

      await stateVariablesApi.listStateVariables("proj-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(
        stateVariablesApi.listStateVariables("proj-1")
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("Get State Variable", () => {
    it("should get state variable by ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      const result = await stateVariablesApi.getStateVariable("var-1");

      expect(result).toEqual(mockVariable);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/state-variables/var-1");
      expect(options?.method).toBe("GET");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.getStateVariable("var-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "State variable not found" }),
      });

      await expect(
        stateVariablesApi.getStateVariable("unknown")
      ).rejects.toThrow("State variable not found");
    });
  });

  describe("Create State Variable", () => {
    const validBody: CreateStateVariableBody = {
      key: "met_lucas",
      description: "Met Lucas",
      category: "flags",
    };

    it("should create state variable successfully", async () => {
      const newVariable: Variable = {
        ...mockVariable,
        id: "var-2",
        key: "met_lucas",
        description: "Met Lucas",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: newVariable }),
      });

      const result = await stateVariablesApi.createStateVariable(
        "proj-1",
        validBody
      );

      expect(result).toEqual(newVariable);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/state-variables");
      expect(options?.method).toBe("POST");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.createStateVariable("proj-1", validBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(validBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.createStateVariable("proj-1", validBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should create with only required fields", async () => {
      const minimalBody = { key: "minimal_flag" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stateVariable: {
            id: "var-min",
            projectId: "proj-1",
            key: "minimal_flag",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        }),
      });

      const result = await stateVariablesApi.createStateVariable(
        "proj-1",
        minimalBody
      );

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
        json: async () => ({ error: "Invalid state variable data" }),
      });

      await expect(
        stateVariablesApi.createStateVariable("proj-1", validBody)
      ).rejects.toThrow("Invalid state variable data");
    });
  });

  describe("Update State Variable", () => {
    const updateBody: UpdateStateVariableBody = {
      description: "Updated description",
      category: "story",
    };

    it("should update state variable successfully", async () => {
      const updatedVariable: Variable = {
        ...mockVariable,
        description: "Updated description",
        category: "story",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: updatedVariable }),
      });

      const result = await stateVariablesApi.updateStateVariable(
        "var-1",
        updateBody
      );

      expect(result).toEqual(updatedVariable);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/state-variables/var-1");
      expect(options?.method).toBe("PATCH");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.updateStateVariable("var-1", updateBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(updateBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.updateStateVariable("var-1", updateBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle partial update", async () => {
      const partialBody = { description: "New description" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.updateStateVariable("var-1", partialBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(partialBody);
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "State variable not found" }),
      });

      await expect(
        stateVariablesApi.updateStateVariable("unknown", updateBody)
      ).rejects.toThrow("State variable not found");
    });
  });

  describe("Delete State Variable", () => {
    it("should delete state variable successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      const result = await stateVariablesApi.deleteStateVariable("var-1");

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/state-variables/var-1");
      expect(options?.method).toBe("DELETE");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      await stateVariablesApi.deleteStateVariable("var-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "State variable not found" }),
      });

      await expect(
        stateVariablesApi.deleteStateVariable("unknown")
      ).rejects.toThrow("State variable not found");
    });

    it("should handle successful delete with no content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        // No body for 204
      });

      const result = await stateVariablesApi.deleteStateVariable("var-1");

      expect(result).toBeUndefined();
    });
  });

  describe("Request Headers", () => {
    it("should set Content-Type header for POST/PATCH", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stateVariable: mockVariable }),
      });

      await stateVariablesApi.createStateVariable("proj-1", {
        key: "test",
      });

      await stateVariablesApi.updateStateVariable("var-1", {
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

      await expect(
        stateVariablesApi.listStateVariables("proj-1")
      ).rejects.toThrow("Unknown error");
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(stateVariablesApi.getStateVariable("var-1")).rejects.toThrow(
        "Request failed with status 503"
      );
    });
  });
});
