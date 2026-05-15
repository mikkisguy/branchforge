/**
 * Projects Routes Unit Tests
 *
 * Tests for the projects API routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { projectsRoutes } from "../projects.routes.js";
import * as projectsService from "../../services/projects.service.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../../middleware/error-handler.middleware.js";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

// Mock the projects service
vi.mock("../../services/projects.service.js", () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectFiles: vi.fn(),
  updateFileContent: vi.fn(),
}));

// Mock the authenticate middleware to attach a test user
vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: async (request: any, _reply: any) => {
    (request as any).user = {
      id: "user-123",
      email: "test@example.com",
      role: "OWNER" as const,
    };
  },
}));

describe("ProjectsRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a fresh Fastify instance for each test
    fastify = Fastify();

    // Register the routes
    await projectsRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  describe("GET /projects", () => {
    it("should return empty array when user has no projects", async () => {
      vi.mocked(projectsService.listProjects).mockResolvedValue([]);

      const response = await fastify.inject({
        method: "GET",
        url: "/projects",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: [] });
    });

    it("should return list of projects", async () => {
      const mockProjects = [
        {
          id: "project-1",
          name: "Test Project",
          description: "A test project",
          maxMeterDelta: 10,
          visibility: "OWNER" as const,
          source: "ZIP" as const,
          createdAt: new Date("2024-01-01").toISOString(),
          updatedAt: new Date("2024-01-01").toISOString(),
        },
      ];

      vi.mocked(projectsService.listProjects).mockResolvedValue(mockProjects);

      const response = await fastify.inject({
        method: "GET",
        url: "/projects",
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.projects).toHaveLength(1);
      expect(json.projects[0].id).toBe("project-1");
      expect(json.projects[0].name).toBe("Test Project");
    });
  });

  describe("GET /projects/:id", () => {
    it("should return project when found and accessible", async () => {
      const mockProject = {
        id: PROJECT_ID,
        name: "Test Project",
        description: "A test project",
        maxMeterDelta: 10,
        visibility: "OWNER" as const,
        source: "ZIP" as const,
        createdAt: new Date("2024-01-01").toISOString(),
        updatedAt: new Date("2024-01-01").toISOString(),
      };

      vi.mocked(projectsService.getProject).mockResolvedValue(mockProject);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.project.id).toBe(PROJECT_ID);
      expect(json.project.name).toBe("Test Project");
    });

    it("should return 404 when project not found", async () => {
      vi.mocked(projectsService.getProject).mockResolvedValue(null);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Project not found" });
    });
  });

  describe("PATCH /projects/:projectId", () => {
    it("should update project successfully", async () => {
      const requestBody = {
        name: "Updated Project",
        description: "Updated description",
      };

      const mockProject = {
        id: PROJECT_ID,
        ...requestBody,
        maxMeterDelta: 10,
        visibility: "OWNER" as const,
        source: "ZIP" as const,
        createdAt: new Date("2024-01-01").toISOString(),
        updatedAt: new Date("2024-01-02").toISOString(),
      };

      vi.mocked(projectsService.updateProject).mockResolvedValue(mockProject);

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/${PROJECT_ID}`,
        payload: requestBody,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.project.id).toBe(PROJECT_ID);
      expect(json.project.name).toBe("Updated Project");
      expect(json.project.description).toBe("Updated description");
      expect(projectsService.updateProject).toHaveBeenCalledWith(
        "user-123",
        PROJECT_ID,
        requestBody
      );
    });

    it("should return 400 for invalid validation", async () => {
      const requestBody = {
        name: "",
        description: "Too long description".repeat(100),
      };

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/${PROJECT_ID}`,
        payload: requestBody,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: "Invalid request body",
      });
    });

    it("should return 404 when project not found", async () => {
      const requestBody = {
        name: "Updated Project",
      };

      vi.mocked(projectsService.updateProject).mockRejectedValue(
        new NotFoundError("Project")
      );

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/${PROJECT_ID}`,
        payload: requestBody,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Not found" });
      expect(projectsService.updateProject).toHaveBeenCalledWith(
        "user-123",
        PROJECT_ID,
        requestBody
      );
    });

    it("should return 403 for forbidden", async () => {
      const requestBody = {
        name: "Updated Project",
      };

      vi.mocked(projectsService.updateProject).mockRejectedValue(
        new ForbiddenError("Insufficient permissions")
      );

      const response = await fastify.inject({
        method: "PATCH",
        url: `/projects/${PROJECT_ID}`,
        payload: requestBody,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
      expect(projectsService.updateProject).toHaveBeenCalledWith(
        "user-123",
        PROJECT_ID,
        requestBody
      );
    });
  });

  describe("DELETE /projects/:projectId", () => {
    it("should delete project successfully", async () => {
      vi.mocked(projectsService.deleteProject).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/${PROJECT_ID}`,
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
    });

    it("should return 404 when project not found", async () => {
      vi.mocked(projectsService.deleteProject).mockRejectedValue(
        new NotFoundError("Project")
      );

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/${PROJECT_ID}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Not found" });
    });

    it("should return 403 for forbidden", async () => {
      vi.mocked(projectsService.deleteProject).mockRejectedValue(
        new ForbiddenError("Insufficient permissions")
      );

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/${PROJECT_ID}`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });
  });

  describe("GET /projects/:projectId/files", () => {
    it("should return files with labels", async () => {
      const mockResult = {
        files: [
          {
            id: "file-1",
            projectId: PROJECT_ID,
            source: "GITLAB",
            filePath: "labels/ch1.rpy",
            fileType: "STORY",
            content: "label start:",
            contentHash: "abc123",
            createdAt: new Date("2024-01-01"),
            updatedAt: new Date("2024-01-02"),
            labels: [
              {
                id: "lbl-1",
                labelName: "start",
                title: "Start",
                status: "DRAFT",
              },
            ],
          },
        ],
      };

      vi.mocked(projectsService.getProjectFiles).mockResolvedValue(mockResult);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/files`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(1);
      expect(json.files[0].id).toBe("file-1");
      expect(json.files[0].labels).toHaveLength(1);
      expect(projectsService.getProjectFiles).toHaveBeenCalledWith(
        PROJECT_ID,
        "user-123",
        undefined
      );
    });

    it("should pass source filter to service", async () => {
      vi.mocked(projectsService.getProjectFiles).mockResolvedValue({
        files: [],
      });

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/files?source=GITLAB`,
      });

      expect(response.statusCode).toBe(200);
      expect(projectsService.getProjectFiles).toHaveBeenCalledWith(
        PROJECT_ID,
        "user-123",
        "GITLAB"
      );
    });

    it("should return 404 when project not found", async () => {
      vi.mocked(projectsService.getProjectFiles).mockRejectedValue(
        new NotFoundError("Project")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/files`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Project not found" });
    });

    it("should return 403 when access denied", async () => {
      vi.mocked(projectsService.getProjectFiles).mockRejectedValue(
        new ForbiddenError("You do not have access to this project")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/files`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });

    it("should return 500 on unexpected errors", async () => {
      vi.mocked(projectsService.getProjectFiles).mockRejectedValue(
        new Error("DB connection failed")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/files`,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "Failed to get project files",
      });
    });
  });

  describe("PUT /projects/files/:fileId", () => {
    const FILE_ID = "660e8400-e29b-41d4-a716-446655440001";

    it("should update file content successfully", async () => {
      const mockResult = {
        success: true as const,
        contentHash: "newhash123",
        updatedAt: new Date("2024-01-02").toISOString(),
        syncResult: {
          labelsCreated: 2,
          labelsUpdated: 1,
          labelsDeleted: 0,
          linesProcessed: 50,
          errors: [],
        },
      };

      vi.mocked(projectsService.updateFileContent).mockResolvedValue(
        mockResult
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/files/${FILE_ID}`,
        payload: { content: "label start:\n  'Hello'\n" },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.contentHash).toBe("newhash123");
      expect(json.syncResult.labelsCreated).toBe(2);
      expect(projectsService.updateFileContent).toHaveBeenCalledWith(
        FILE_ID,
        "user-123",
        "label start:\n  'Hello'\n",
        undefined
      );
    });

    it("should pass expectedContentHash for optimistic concurrency", async () => {
      const mockResult = {
        success: true as const,
        contentHash: "newhash123",
        updatedAt: new Date("2024-01-02").toISOString(),
        syncResult: {
          labelsCreated: 0,
          labelsUpdated: 0,
          labelsDeleted: 0,
          linesProcessed: 0,
          errors: [],
        },
      };

      vi.mocked(projectsService.updateFileContent).mockResolvedValue(
        mockResult
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/files/${FILE_ID}`,
        payload: { content: "updated content", expectedContentHash: "oldhash" },
      });

      expect(response.statusCode).toBe(200);
      expect(projectsService.updateFileContent).toHaveBeenCalledWith(
        FILE_ID,
        "user-123",
        "updated content",
        "oldhash"
      );
    });

    it("should return 409 on content hash conflict", async () => {
      vi.mocked(projectsService.updateFileContent).mockRejectedValue(
        new ConflictError("Content hash mismatch. Current hash: serverhash")
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/files/${FILE_ID}`,
        payload: { content: "updated content", expectedContentHash: "oldhash" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "Resource conflict",
      });
    });

    it("should return 404 when file not found", async () => {
      vi.mocked(projectsService.updateFileContent).mockRejectedValue(
        new NotFoundError("File")
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/files/${FILE_ID}`,
        payload: { content: "content" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "File not found" });
    });

    it("should return 400 when content invalid", async () => {
      vi.mocked(projectsService.updateFileContent).mockRejectedValue(
        new ValidationError("Invalid RPY file content")
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/files/${FILE_ID}`,
        payload: { content: "..." },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty("error");
    });

    it("should return 403 when access denied", async () => {
      vi.mocked(projectsService.updateFileContent).mockRejectedValue(
        new ForbiddenError("Insufficient permissions")
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/files/${FILE_ID}`,
        payload: { content: "content" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Insufficient permissions" });
    });
  });
});
