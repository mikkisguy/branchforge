/**
 * Projects API Unit Tests
 *
 * Tests for project management API methods.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { projectsApi } from "../projects";
import type { Project, UpdateProjectBody } from "@/lib/api/projects";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Projects API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("List Projects", () => {
    const mockProjects: Project[] = [
      {
        id: "proj-1",
        name: "Test Project",
        description: "A test project",
        maxStatDelta: 5,
        visibility: "OWNER",
        source: "ZIP",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    it("should list all projects successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: mockProjects }),
      });

      const result = await projectsApi.listProjects();

      expect(result).toEqual(mockProjects);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects");
      expect(options?.method).toBe("GET");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [] }),
      });

      await projectsApi.listProjects();

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle empty projects list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [] }),
      });

      const result = await projectsApi.listProjects();

      expect(result).toEqual([]);
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(projectsApi.listProjects()).rejects.toThrow("Unauthorized");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(projectsApi.listProjects()).rejects.toThrow("Network error");
    });
  });

  describe("Get Project", () => {
    const mockProject: Project = {
      id: "proj-1",
      name: "Test Project",
      description: "A test project",
      maxStatDelta: 5,
      visibility: "OWNER",
      source: "ZIP",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    it("should get project by ID successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      const result = await projectsApi.getProject("proj-1");

      expect(result).toEqual(mockProject);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1");
      expect(options?.method).toBe("GET");
    });

    it("should encode projectId in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      await projectsApi.getProject("project with spaces");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(encodeURIComponent("project with spaces"));
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      await projectsApi.getProject("proj-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Project not found" }),
      });

      await expect(projectsApi.getProject("unknown")).rejects.toThrow(
        "Project not found"
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

      await expect(projectsApi.listProjects()).rejects.toThrow("Unknown error");
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(projectsApi.listProjects()).rejects.toThrow(
        "Request failed with status 503"
      );
    });
  });

  describe("Update Project", () => {
    const mockProject: Project = {
      id: "proj-1",
      name: "Updated Project",
      description: "Updated description",
      maxStatDelta: 10,
      visibility: "OWNER",
      source: "ZIP",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };

    const updateBody: UpdateProjectBody = {
      name: "Updated Project",
      description: "Updated description",
    };

    it("should update project successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      const result = await projectsApi.updateProject("proj-1", updateBody);

      expect(result).toEqual(mockProject);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1");
      expect(options?.method).toBe("PATCH");
    });

    it("should send request body as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      await projectsApi.updateProject("proj-1", updateBody);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual(updateBody);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      await projectsApi.updateProject("proj-1", updateBody);

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle not found error (404)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Project not found" }),
      });

      await expect(
        projectsApi.updateProject("unknown", updateBody)
      ).rejects.toThrow("Project not found");
    });

    it("should handle forbidden error (403)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Insufficient permissions" }),
      });

      await expect(
        projectsApi.updateProject("proj-1", updateBody)
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should handle validation error (400)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid request body" }),
      });

      await expect(
        projectsApi.updateProject("proj-1", updateBody)
      ).rejects.toThrow("Invalid request body");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        projectsApi.updateProject("proj-1", updateBody)
      ).rejects.toThrow("Network error");
    });

    it("should encode projectId in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: mockProject }),
      });

      await projectsApi.updateProject("project with spaces", updateBody);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain(encodeURIComponent("project with spaces"));
      expect(options?.method).toBe("PATCH");
    });
  });

  describe("Delete Project", () => {
    it("should delete project successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(
        projectsApi.deleteProject("proj-1")
      ).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1");
      expect(options?.method).toBe("DELETE");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await projectsApi.deleteProject("proj-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should not send JSON Content-Type for DELETE without body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await projectsApi.deleteProject("proj-1");

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers?.["Content-Type"]).toBeUndefined();
      expect(headers?.get?.("Content-Type")).toBeUndefined();
    });

    it("should handle not found error (404)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Project not found" }),
      });

      await expect(projectsApi.deleteProject("unknown")).rejects.toThrow(
        "Project not found"
      );
    });

    it("should handle forbidden error (403)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Insufficient permissions" }),
      });

      await expect(projectsApi.deleteProject("proj-1")).rejects.toThrow(
        "Insufficient permissions"
      );
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(projectsApi.deleteProject("proj-1")).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("Import ZIP", () => {
    const mockProject: Project = {
      id: "proj-zip",
      name: "zip test",
      description: "",
      maxStatDelta: 5,
      visibility: "OWNER",
      source: "ZIP",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    it("should import ZIP file successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: mockProject,
          filesImported: 1,
          labelsCreated: 0,
        }),
      });

      const file = new File(["zip-content"], "BranchForgeTest.zip", {
        type: "application/zip",
      });

      const result = await projectsApi.importZip({
        file,
        projectName: "zip test",
      });

      expect(result).toEqual({
        project: mockProject,
        filesImported: 1,
        labelsCreated: 0,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/import/zip");
      expect(options?.method).toBe("POST");
    });

    it("should send project metadata before file in multipart body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: mockProject,
          filesImported: 1,
          labelsCreated: 0,
        }),
      });

      const file = new File(["zip-content"], "BranchForgeTest.zip", {
        type: "application/zip",
      });

      await projectsApi.importZip({
        file,
        projectName: "zip test",
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = options?.body;

      if (!(body instanceof FormData)) {
        throw new Error("Expected body to be FormData");
      }

      const keys = Array.from(body.keys());

      expect(keys[0]).toBe("projectName");
      expect(keys[keys.length - 1]).toBe("file");
      expect(body.get("projectName")).toBe("zip test");
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: mockProject,
          filesImported: 1,
          labelsCreated: 0,
        }),
      });

      const file = new File(["zip-content"], "test.zip", {
        type: "application/zip",
      });

      await projectsApi.importZip({
        file,
        projectName: "test",
      });

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should attach file with correct properties", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: mockProject,
          filesImported: 1,
          labelsCreated: 0,
        }),
      });

      const file = new File(["zip-content"], "TestProject.zip", {
        type: "application/zip",
      });

      await projectsApi.importZip({
        file,
        projectName: "TestProject",
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = options?.body;

      if (!(body instanceof FormData)) {
        throw new Error("Expected body to be FormData");
      }

      const uploadedFile = body.get("file");

      expect(uploadedFile).toBeInstanceOf(File);
      expect(uploadedFile).not.toBeNull();

      if (uploadedFile instanceof File) {
        expect(uploadedFile.name).toBe("TestProject.zip");
        expect(uploadedFile.type).toBe("application/zip");
      }
    });

    it("should handle validation error (400)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid ZIP file" }),
      });

      const file = new File(["invalid"], "test.zip", {
        type: "application/zip",
      });

      await expect(
        projectsApi.importZip({
          file,
          projectName: "test",
        })
      ).rejects.toThrow("Invalid ZIP file");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const file = new File(["content"], "test.zip", {
        type: "application/zip",
      });

      await expect(
        projectsApi.importZip({
          file,
          projectName: "test",
        })
      ).rejects.toThrow("Network error");
    });
  });
});
