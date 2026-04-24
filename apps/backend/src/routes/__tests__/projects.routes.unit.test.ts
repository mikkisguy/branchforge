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
} from "../../middleware/error-handler.middleware.js";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

// Mock the projects service
vi.mock("../../services/projects.service.js", () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
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
});
