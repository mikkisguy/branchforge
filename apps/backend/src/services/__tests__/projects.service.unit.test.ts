import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getProject,
  createProject,
  type CreateProjectBody,
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

// Mock insert with flexible typing since we override it in tests
const mockInsert = vi.fn().mockImplementation(() => ({
  values: vi.fn(() => ({
    returning: vi.fn(() => Promise.resolve([])),
  })),
}));

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
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
    type: "PREQUEL",
    description: "A test project",
    routeLockChapter: 1,
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
        type: "PREQUEL",
        description: "A test project",
        routeLockChapter: 1,
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
      mockInsert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      }));
    });

    it("should create project with valid data", async () => {
      const body: CreateProjectBody = {
        name: "New Project",
        type: "PREQUEL",
        description: "A new project",
        routeLockChapter: 2,
        maxMeterDelta: 15,
      };

      const newProject = { ...mockProject, ...body, id: "new-project-id" };
      mockInsert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([newProject])),
        })),
      }));

      const project = await createProject(userId, body);

      expect(project.name).toBe("New Project");
      expect(project.type).toBe("PREQUEL");
      expect(project.description).toBe("A new project");
      expect(project.routeLockChapter).toBe(2);
      expect(project.maxMeterDelta).toBe(15);
    });

    it("should use default maxMeterDelta when not provided", async () => {
      const body: CreateProjectBody = {
        name: "New Project",
        type: "SEQUEL",
      };

      const newProject = { ...mockProject, ...body, maxMeterDelta: 10 };
      mockInsert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([newProject])),
        })),
      }));

      const project = await createProject(userId, body);

      expect(project.maxMeterDelta).toBe(10);
    });

    it("should create project with optional fields undefined", async () => {
      const body: CreateProjectBody = {
        name: "Minimal Project",
        type: "PREQUEL",
      };

      const newProject = {
        ...mockProject,
        name: "Minimal Project",
        description: null,
        routeLockChapter: null,
        maxMeterDelta: 10,
      };
      mockInsert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([newProject])),
        })),
      }));

      const project = await createProject(userId, body);

      expect(project.description).toBeUndefined();
      expect(project.routeLockChapter).toBeUndefined();
    });
  });
});

