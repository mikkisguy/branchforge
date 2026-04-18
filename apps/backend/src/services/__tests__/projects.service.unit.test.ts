import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getProject,
  createProject,
  updateProject,
  deleteProject,
  type CreateProjectBody,
  type UpdateProjectBody,
} from "../projects.service.js";

// Mock the database with a complete chain builder
const createMockChain = (resolveValue: any) => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(resolveValue)),
      orderBy: vi.fn(() => Promise.resolve(resolveValue)),
    })),
    innerJoin: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(resolveValue)),
      })),
    })),
    limit: vi.fn(() => Promise.resolve(resolveValue)),
    orderBy: vi.fn(() => Promise.resolve(resolveValue)),
  })),
});

// Use a function that returns a fresh chain each time
const createEmptyMockChain = () => createMockChain([]);
const mockSelect = vi.fn(createEmptyMockChain);

const createInsertChain = (resolveValue: unknown[] = []) => ({
  values: vi.fn(() => ({
    returning: vi.fn<() => Promise<unknown[]>>(() =>
      Promise.resolve(resolveValue)
    ),
  })),
});

// Mock insert with flexible typing since we override it in tests
const mockInsert = vi.fn(createInsertChain);
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
};

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

describe("ProjectsService", () => {
  const userId = "user-123";
  const projectId = "project-123";

  const mockProject = {
    id: projectId,
    userId,
    name: "Test Project",
    description: "A test project",
    maxMeterDelta: 10,
    visibility: "OWNER",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  // listProjects tests moved to integration tests due to complex ORM queries

  describe("getProject", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should return project owned by user", async () => {
      mockSelect.mockImplementation(() => createMockChain([mockProject]));

      const project = await getProject(projectId, userId);

      expect(project).toEqual({
        id: projectId,
        name: "Test Project",
        description: "A test project",
        maxMeterDelta: 10,
        visibility: "OWNER",
        createdAt: mockProject.createdAt,
        updatedAt: mockProject.updatedAt,
      });
    });

    it("should return project shared with user", async () => {
      // First call (owner check) returns empty, second call (shared check) returns project
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChain([]);
        }
        return createMockChain([mockProject]);
      });

      const project = await getProject(projectId, userId);

      expect(project).toBeDefined();
      expect(project?.id).toBe(projectId);
    });

    it("should return null when project not found or not accessible", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      const project = await getProject(projectId, userId);

      expect(project).toBeNull();
    });

    it("should return null for different user", async () => {
      const otherUserId = "other-user-456";
      mockSelect.mockImplementation(createEmptyMockChain);

      const project = await getProject(projectId, otherUserId);

      expect(project).toBeNull();
    });
  });

  describe("createProject", () => {
    beforeEach(() => {
      mockInsert.mockImplementation(() => createInsertChain());
    });

    it("should create project with valid data", async () => {
      const body: CreateProjectBody = {
        name: "New Project",
        description: "A new project",
        maxMeterDelta: 15,
      };

      const newProject = { ...mockProject, ...body, id: "new-project-id" };
      mockInsert.mockImplementation(() => createInsertChain([newProject]));

      const project = await createProject(userId, body);

      expect(project.name).toBe("New Project");
      expect(project.description).toBe("A new project");
      expect(project.maxMeterDelta).toBe(15);
    });

    it("should use default maxMeterDelta when not provided", async () => {
      const body: CreateProjectBody = {
        name: "New Project",
      };

      const newProject = { ...mockProject, ...body, maxMeterDelta: 10 };
      mockInsert.mockImplementation(() => createInsertChain([newProject]));

      const project = await createProject(userId, body);

      expect(project.maxMeterDelta).toBe(10);
    });

    it("should create project with optional fields undefined", async () => {
      const body: CreateProjectBody = {
        name: "Minimal Project",
      };

      const newProject = {
        ...mockProject,
        name: "Minimal Project",
        description: null,
        maxMeterDelta: 10,
      };
      mockInsert.mockImplementation(() => createInsertChain([newProject]));

      const project = await createProject(userId, body);

      expect(project.description).toBeUndefined();
    });
  });

  describe("updateProject", () => {
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
        })),
      })),
    };

    beforeEach(() => {
      mockUpdate.mockReturnValue(updateChain);
    });

    it("should update project name and description successfully", async () => {
      const body: UpdateProjectBody = {
        name: "Updated Project",
        description: "Updated description",
      };

      const updatedProject = {
        ...mockProject,
        name: "Updated Project",
        description: "Updated description",
      };

      mockSelect.mockImplementation(() => createMockChain([{ userId }]));

      updateChain.set.mockReturnValue({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([updatedProject])),
        })),
      });

      const result = await updateProject(userId, projectId, body);

      expect(result.name).toBe("Updated Project");
      expect(result.description).toBe("Updated description");
      expect(mockUpdate).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalled();
    });

    it("should update project with only name", async () => {
      const body: UpdateProjectBody = {
        name: "New Name",
      };

      const updatedProject = {
        ...mockProject,
        name: "New Name",
      };

      mockSelect.mockImplementation(() => createMockChain([{ userId }]));

      updateChain.set.mockReturnValue({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([updatedProject])),
        })),
      });

      const result = await updateProject(userId, projectId, body);

      expect(result.name).toBe("New Name");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      const body: UpdateProjectBody = {
        name: "Updated Project",
      };

      mockSelect.mockImplementation(createEmptyMockChain);

      updateChain.set.mockReturnValue({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      });

      await expect(updateProject(userId, projectId, body)).rejects.toThrow(
        "Project not found"
      );
    });

    it("should throw ForbiddenError when user is not the owner", async () => {
      const otherUserId = "other-user-456";
      const body: UpdateProjectBody = {
        name: "Updated Project",
      };

      mockSelect.mockImplementation(() => createMockChain([{ userId }]));

      updateChain.set.mockReturnValue({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      });

      await expect(updateProject(otherUserId, projectId, body)).rejects.toThrow(
        "Only project owners can update projects"
      );
    });
  });

  describe("deleteProject", () => {
    const deleteChain = {
      where: vi.fn(() => ({
        returning: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
      })),
    };

    beforeEach(() => {
      mockDelete.mockReturnValue(deleteChain);
    });

    it("should permanently delete project successfully", async () => {
      mockSelect.mockImplementation(() => createMockChain([{ userId }]));

      deleteChain.where.mockReturnValue({
        returning: vi.fn(() => Promise.resolve([{ id: projectId }])),
      });

      await expect(deleteProject(userId, projectId)).resolves.not.toThrow();

      expect(mockDelete).toHaveBeenCalled();
      expect(deleteChain.where).toHaveBeenCalled();
    });

    it("should throw NotFoundError when project does not exist", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      deleteChain.where.mockReturnValue({
        returning: vi.fn(() => Promise.resolve([])),
      });

      await expect(deleteProject(userId, projectId)).rejects.toThrow(
        "Project not found"
      );
    });

    it("should throw ForbiddenError when user is not the owner", async () => {
      const otherUserId = "other-user-456";

      mockSelect.mockImplementation(() => createMockChain([{ userId }]));

      deleteChain.where.mockReturnValue({
        returning: vi.fn(() => Promise.resolve([])),
      });

      await expect(deleteProject(otherUserId, projectId)).rejects.toThrow(
        "Only project owners can delete projects"
      );
    });

    it("should throw NotFoundError on repeated delete", async () => {
      mockSelect
        .mockImplementationOnce(() => createMockChain([{ userId }]))
        .mockImplementationOnce(createEmptyMockChain);

      deleteChain.where.mockReturnValue({
        returning: vi.fn(() => Promise.resolve([{ id: projectId }])),
      });

      await expect(deleteProject(userId, projectId)).resolves.not.toThrow();
      await expect(deleteProject(userId, projectId)).rejects.toThrow(
        "Project not found"
      );
    });
  });
});
