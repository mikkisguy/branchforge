/**
 * Ren'Py Definitions API Unit Tests
 *
 * Tests for Ren'Py definition management API methods.
 */

import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renpyDefinitionsApi } from "../renpy-definitions";
import type {
  CreateRenpyDefinitionBody,
  UpdateRenpyDefinitionBody,
} from "../renpy-definitions";
import type {
  RenpyDefinition,
  RenpyDefinitionCategory,
} from "@branchforge/shared";

// Mock fetch globally
const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Ren'Py Definitions API", () => {
  afterAll(() => {
    global.fetch = originalFetch;
  });
  const mockRenpyDefinition: RenpyDefinition = {
    id: "def-1",
    projectId: "proj-1",
    category: "CHARACTER" as RenpyDefinitionCategory,
    tag: "a",
    displayName: "Eileen",
    definitionCode: 'define a = Character("Eileen")',
    referenceTag: null,
    sortOrder: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("List Ren'Py Definitions", () => {
    it("should list all Ren'Py definitions for a project", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinitions: [mockRenpyDefinition] }),
      });

      const result = await renpyDefinitionsApi.listRenpyDefinitions("proj-1");

      expect(result).toEqual([mockRenpyDefinition]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/renpy-definitions");
      expect(options?.method).toBe("GET");
    });

    it("should handle empty list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinitions: [] }),
      });

      const result = await renpyDefinitionsApi.listRenpyDefinitions("proj-1");

      expect(result).toEqual([]);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinitions: [] }),
      });

      await renpyDefinitionsApi.listRenpyDefinitions("proj-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(
        renpyDefinitionsApi.listRenpyDefinitions("proj-1")
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("Get Ren'Py Definition", () => {
    it("should get Ren'Py definition by ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      const result = await renpyDefinitionsApi.getRenpyDefinition("def-1");

      expect(result).toEqual(mockRenpyDefinition);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/renpy-definitions/def-1");
      expect(options?.method).toBe("GET");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.getRenpyDefinition("def-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Ren'Py definition not found" }),
      });

      await expect(
        renpyDefinitionsApi.getRenpyDefinition("unknown")
      ).rejects.toThrow("Ren'Py definition not found");
    });
  });

  describe("Create Ren'Py Definition", () => {
    const validBody: CreateRenpyDefinitionBody = {
      category: "CHARACTER",
      tag: "l",
      displayName: "Lucas",
      definitionCode: 'define l = Character("Lucas")',
      referenceTag: null,
      sortOrder: 2,
    };

    it("should create Ren'Py definition successfully", async () => {
      const newDefinition: RenpyDefinition = {
        ...mockRenpyDefinition,
        id: "def-2",
        tag: "l",
        displayName: "Lucas",
        definitionCode: 'define l = Character("Lucas")',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: newDefinition }),
      });

      const result = await renpyDefinitionsApi.createRenpyDefinition(
        "proj-1",
        validBody
      );

      expect(result).toEqual(newDefinition);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/renpy-definitions");
      expect(options?.method).toBe("POST");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.createRenpyDefinition("proj-1", validBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(validBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.createRenpyDefinition("proj-1", validBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should create with only required fields", async () => {
      const minimalBody = {
        category: "CHARACTER" as RenpyDefinitionCategory,
        tag: "m",
        displayName: "Maya",
        definitionCode: 'define m = Character("Maya")',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          renpyDefinition: {
            id: "def-min",
            projectId: "proj-1",
            ...minimalBody,
            referenceTag: null,
            sortOrder: 0,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        }),
      });

      const result = await renpyDefinitionsApi.createRenpyDefinition(
        "proj-1",
        minimalBody
      );

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(minimalBody);
      expect(result.tag).toBe("m");
    });

    it("should handle validation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid Ren'Py definition data" }),
      });

      await expect(
        renpyDefinitionsApi.createRenpyDefinition("proj-1", validBody)
      ).rejects.toThrow("Invalid Ren'Py definition data");
    });

    it.each(["CHARACTER", "TRANSFORM", "IMAGE", "INIT"] as const)(
      "should handle category: %s",
      async (category) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            renpyDefinition: {
              ...mockRenpyDefinition,
              category,
            },
          }),
        });

        const result = await renpyDefinitionsApi.createRenpyDefinition(
          "proj-1",
          {
            ...validBody,
            category,
          }
        );

        expect(result.category).toBe(category);
      }
    );
  });

  describe("Update Ren'Py Definition", () => {
    const updateBody: UpdateRenpyDefinitionBody = {
      displayName: "Updated Eileen",
      definitionCode: 'define a = Character("Eileen Updated")',
    };

    it("should update Ren'Py definition successfully", async () => {
      const updatedDefinition: RenpyDefinition = {
        ...mockRenpyDefinition,
        displayName: "Updated Eileen",
        definitionCode: 'define a = Character("Eileen Updated")',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: updatedDefinition }),
      });

      const result = await renpyDefinitionsApi.updateRenpyDefinition(
        "def-1",
        updateBody
      );

      expect(result).toEqual(updatedDefinition);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/renpy-definitions/def-1");
      expect(options?.method).toBe("PATCH");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.updateRenpyDefinition("def-1", updateBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(updateBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.updateRenpyDefinition("def-1", updateBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle partial update", async () => {
      const partialBody = { displayName: "New display name" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.updateRenpyDefinition("def-1", partialBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(partialBody);
    });

    it("should handle updating referenceTag to null", async () => {
      const bodyWithNull: UpdateRenpyDefinitionBody = { referenceTag: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.updateRenpyDefinition("def-1", bodyWithNull);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toHaveProperty("referenceTag", null);
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Ren'Py definition not found" }),
      });

      await expect(
        renpyDefinitionsApi.updateRenpyDefinition("unknown", updateBody)
      ).rejects.toThrow("Ren'Py definition not found");
    });
  });

  describe("Delete Ren'Py Definition", () => {
    it("should delete Ren'Py definition successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      const result = await renpyDefinitionsApi.deleteRenpyDefinition("def-1");

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/renpy-definitions/def-1");
      expect(options?.method).toBe("DELETE");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      });

      await renpyDefinitionsApi.deleteRenpyDefinition("def-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Ren'Py definition not found" }),
      });

      await expect(
        renpyDefinitionsApi.deleteRenpyDefinition("unknown")
      ).rejects.toThrow("Ren'Py definition not found");
    });

    it("should handle successful delete with no content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        // No body for 204
      });

      const result = await renpyDefinitionsApi.deleteRenpyDefinition("def-1");

      expect(result).toBeUndefined();
    });
  });

  describe("Request Headers", () => {
    it("should set Content-Type header for POST/PATCH", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.createRenpyDefinition("proj-1", {
        category: "CHARACTER",
        tag: "x",
        displayName: "X",
        definitionCode: "code",
      });

      expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renpyDefinition: mockRenpyDefinition }),
      });

      await renpyDefinitionsApi.updateRenpyDefinition("some-id", {
        category: "CHARACTER",
        tag: "x",
        displayName: "X",
        definitionCode: "code",
      });

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
        renpyDefinitionsApi.listRenpyDefinitions("proj-1")
      ).rejects.toThrow("Unknown error");
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(
        renpyDefinitionsApi.getRenpyDefinition("def-1")
      ).rejects.toThrow("Request failed with status 503");
    });

    it("should propagate fetch rejection (network failure)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        renpyDefinitionsApi.listRenpyDefinitions("proj-1")
      ).rejects.toThrow("Network error");
    });
  });
});
