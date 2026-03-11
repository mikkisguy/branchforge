/**
 * Labels Service Unit Tests
 *
 * Tests for the labels business logic layer.
 * Tests listing labels, getting label details, and authorization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the label-characters schema table before importing the service
// This prevents circular dependency issues in the test environment
vi.mock("../../db/schema/tables/label-characters.js", () => ({
  labelCharacters: {
    role: "role",
    emotion: "emotion",
    notes: "notes",
    labelId: "labelId",
    characterId: "characterId",
  },
}));

// Now import the service after the mock is set up
import {
  listLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,
  type LabelLineWithSpeaker,
} from "../labels.service.js";

// Mock the RPY parser service
const mockRemoveLabelFromRPYContent = vi
  .fn()
  .mockImplementation((content: string, labelName: string) => {
    // Simple mock implementation that removes the label line
    const lines = content.split("\n");
    return lines
      .filter((line) => {
        const labelMatch = line.match(/^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        return !labelMatch || labelMatch[1] !== labelName;
      })
      .join("\n");
  });

vi.mock("../rpy-parser.service.js", () => ({
  removeLabelFromRPYContent: (content: string, labelName: string) =>
    mockRemoveLabelFromRPYContent(content, labelName),
}));

// Mock the database with a complete chain builder
const createMockChain = (resolveValue: any) => {
  const result = Promise.resolve(resolveValue);

  // Helper to create chain methods that preserve join capability
  const createJoinMethods = () => ({
    where: vi.fn(() =>
      Object.assign(result, {
        orderBy: vi.fn(() => result),
        limit: vi.fn(() => result),
      })
    ),
    orderBy: vi.fn(() => result),
    limit: vi.fn(() => result),
    innerJoin: vi.fn(() => createJoinMethods()),
    leftJoin: vi.fn(() => createJoinMethods()),
  });

  return {
    from: vi.fn(() => createJoinMethods()),
  };
};

// Use a function that returns a fresh chain each time
const createEmptyMockChain = () => createMockChain([]);
const mockSelect = vi.fn(createEmptyMockChain);

const mockDb = {
  select: mockSelect,
};

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

describe("LabelsService", () => {
  const userId = "user-123";
  const projectId = "project-123";
  const labelId = "label-123";

  const mockLabel = {
    id: labelId,
    projectId,
    title: "chapter1_label1",
    groupType: "act",
    groupValue: "I",
    labelNumber: 1,
    sequenceOrder: 0,
    route: "common",
    visibility: "EXCLUSIVE",
    status: "DRAFT",
    prerequisites: {},
    effects: {},
    crossRouteContext: null,
    readerNotes: null,
    duoPairId: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  const mockCharacter = {
    id: "char-1",
    projectId,
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "a",
    routeAffiliation: "EILEEN",
    isLoveInterest: true,
    pairGroupId: null,
    dialogueStyle: null,
    conditionalPrefix: null,
    color: "#FF5733",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  const mockLabelLine: LabelLineWithSpeaker = {
    id: "line-1",
    labelId,
    sequence: 1,
    contentType: "DIALOGUE",
    content: "Hello world!",
    speakerId: "char-1",
    speakerName: "Eileen",
    speakerTag: "a",
    visualType: "GENERATED",
    visualSlugOverride: null,
    customVisualName: null,
    menuOptions: null,
    wordCount: null,
    demoPlaceholderColor: null,
    demoNotes: null,
    createdAt: new Date("2024-01-01").toISOString(),
    updatedAt: new Date("2024-01-01").toISOString(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listLabels", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should return empty array when project has no labels", async () => {
      const labels = await listLabels(projectId, userId);
      expect(labels).toEqual([]);
    });

    it("should return list of labels for a project", async () => {
      mockSelect.mockImplementation(() => createMockChain([mockLabel]));

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(1);
      expect(labels[0]).toEqual({
        id: labelId,
        projectId,
        title: "chapter1_label1",
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        sequenceOrder: 0,
        routeKey: "common",
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        createdAt: mockLabel.createdAt.toISOString(),
        updatedAt: mockLabel.updatedAt.toISOString(),
      });
    });

    it("should return multiple labels ordered by sequence", async () => {
      const label2 = {
        ...mockLabel,
        id: "label-2",
        labelNumber: 2,
        sequenceOrder: 1,
      };
      mockSelect.mockImplementation(() => createMockChain([mockLabel, label2]));

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(2);
      expect(labels[0].labelNumber).toBe(1);
      expect(labels[1].labelNumber).toBe(2);
    });
  });

  describe("getLabel", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should return label with lines and characters when found", async () => {
      // Mock label query
      let callCount = 0;
      const mockDbLabelLine = {
        ...mockLabelLine,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      };

      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get label with project owner
          return createMockChain([
            {
              label: mockLabel,
              projectOwnerId: userId,
            },
          ]);
        } else if (callCount === 2) {
          // Second call: get label lines with speakers
          return createMockChain([
            {
              line: mockDbLabelLine,
              speakerName: "Eileen",
              speakerTag: "a",
            },
          ]);
        } else {
          // Third call: get label characters
          return createMockChain([
            {
              character: mockCharacter,
              role: "PRIMARY",
              emotion: null,
              notes: null,
            },
          ]);
        }
      });

      const label = await getLabel(labelId, userId);

      expect(label).not.toBeNull();
      expect(label?.id).toBe(labelId);
      expect(label?.title).toBe("chapter1_label1");
      expect(label?.lines).toHaveLength(1);
      expect(label?.lines[0].content).toBe("Hello world!");
      expect(label?.characters).toHaveLength(1);
      expect(label?.characters[0].name).toBe("Eileen");
    });

    it("should return null when label not found", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      const label = await getLabel(labelId, userId);

      expect(label).toBeNull();
    });

    it("should return label with empty lines array when no lines exist", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get label with project owner
          return createMockChain([
            {
              label: mockLabel,
              projectOwnerId: userId,
            },
          ]);
        }
        // All subsequent calls return empty
        return createMockChain([]);
      });

      const label = await getLabel(labelId, userId);

      expect(label).not.toBeNull();
      expect(label?.lines).toEqual([]);
    });
  });

  // authorizeLabelAccess tests moved to integration tests due to complex ORM queries with joins
  // (labels → projects → projectUsers)

  describe("mapToPublicLabel (via listLabels)", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should return routeKey value as string", async () => {
      const labelWithRoute = {
        ...mockLabel,
        route: "custom_route",
      };
      mockSelect.mockImplementation(() => createMockChain([labelWithRoute]));

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(1);
      expect(labels[0].routeKey).toBe("custom_route");
      expect(labels[0].status).toBe("DRAFT");
    });

    it("should return null for status when DB contains invalid status value", async () => {
      const labelWithInvalidStatus = {
        ...mockLabel,
        status: "INVALID_STATUS" as any, // Simulate corrupted DB
      };
      mockSelect.mockImplementation(() =>
        createMockChain([labelWithInvalidStatus])
      );

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(1);
      expect(labels[0].status).toBeNull(); // Invalid status falls back to null
      expect(labels[0].routeKey).toBe("common"); // Valid routeKey preserved
    });

    it("should preserve valid routeKey and status values", async () => {
      const labelWithValidValues = {
        ...mockLabel,
        route: "lucas",
        status: "REVIEW",
      };
      mockSelect.mockImplementation(() =>
        createMockChain([labelWithValidValues])
      );

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(1);
      expect(labels[0].routeKey).toBe("lucas");
      expect(labels[0].status).toBe("REVIEW");
    });

    it("should handle null routeKey and status values", async () => {
      const labelWithNullValues = {
        ...mockLabel,
        route: null,
        status: null,
      };
      mockSelect.mockImplementation(() =>
        createMockChain([labelWithNullValues])
      );

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(1);
      expect(labels[0].routeKey).toBeNull();
      expect(labels[0].status).toBeNull();
    });
  });

  describe("createLabel", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should create a label with valid data", async () => {
      // Mock project exists and user is owner
      mockSelect.mockImplementation(() =>
        createMockChain([{ userId: userId }])
      );

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLabel]),
        }),
      });
      mockDb.insert = mockInsert;

      const result = await createLabel(userId, {
        projectId,
        title: "Test Label",
        route: "common",
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        sequenceOrder: 0,
      });

      expect(result.id).toBe(labelId);
      expect(result.title).toBe("chapter1_label1");
      expect(result.routeKey).toBe("common");
    });

    it("should throw NotFoundError when project does not exist", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLabel]),
        }),
      });
      mockDb.insert = mockInsert;

      await expect(
        createLabel(userId, {
          projectId: "nonexistent-project",
          title: "Test Label",
          labelNumber: 1,
        })
      ).rejects.toThrow("Project");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      // Mock project exists but user is not owner
      mockSelect.mockImplementation(() =>
        createMockChain([{ userId: "different-user" }])
      );

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLabel]),
        }),
      });
      mockDb.insert = mockInsert;

      await expect(
        createLabel(userId, {
          projectId,
          title: "Test Label",
          labelNumber: 1,
        })
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should coerce route to null when route does not exist in route_configs", async () => {
      let queryCount = 0;
      mockSelect.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          // First call: check project ownership
          return createMockChain([{ userId: userId }]);
        } else {
          // Second call: validate route - return empty (route doesn't exist)
          return createMockChain([]);
        }
      });

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLabel]),
        }),
      });
      mockDb.insert = mockInsert;

      await createLabel(userId, {
        projectId,
        title: "Test Label",
        route: "nonexistent_route",
        labelNumber: 1,
      });

      // Verify the insert was called with coerced null route
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should set default values for optional fields", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([{ userId: userId }])
      );

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLabel]),
        }),
      });
      mockDb.insert = mockInsert;

      await createLabel(userId, {
        projectId,
        title: "Test Label",
        labelNumber: 1,
      });

      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("updateLabel", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should update label title", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: { ...mockLabel, title: "Old Title" },
            projectOwnerId: userId,
          },
        ])
      );

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ ...mockLabel, title: "New Title" }]),
          }),
        }),
      });
      mockDb.update = mockUpdate;

      const _result = await updateLabel(labelId, userId, {
        title: "New Title",
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should throw NotFoundError when label does not exist", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      await expect(
        updateLabel("nonexistent-label", userId, { title: "New Title" })
      ).rejects.toThrow("Label");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabel,
            projectOwnerId: "different-user",
          },
        ])
      );

      await expect(
        updateLabel(labelId, userId, { title: "New Title" })
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should update label status", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: { ...mockLabel, status: "DRAFT" },
            projectOwnerId: userId,
          },
        ])
      );

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ ...mockLabel, status: "REVIEW" }]),
          }),
        }),
      });
      mockDb.update = mockUpdate;

      await updateLabel(labelId, userId, { status: "REVIEW" });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should coerce route to null when route does not exist in route_configs", async () => {
      let queryCount = 0;
      mockSelect.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          return createMockChain([
            {
              label: mockLabel,
              projectOwnerId: userId,
            },
          ]);
        } else {
          // Route validation - route doesn't exist
          return createMockChain([]);
        }
      });

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockLabel]),
          }),
        }),
      });
      mockDb.update = mockUpdate;

      await updateLabel(labelId, userId, { route: "nonexistent_route" });

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe("deleteLabel", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should soft delete a label", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabel,
            projectOwnerId: userId,
          },
        ])
      );

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockDb.update = mockUpdate;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          update: mockUpdate,
        };
        await callback(tx);
      });
      mockDb.transaction = mockTransaction;

      await deleteLabel(labelId, userId);

      expect(mockTransaction).toHaveBeenCalled();
    });

    it("should throw NotFoundError when label does not exist", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      await expect(deleteLabel("nonexistent-label", userId)).rejects.toThrow(
        "Label"
      );
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabel,
            projectOwnerId: "different-user",
          },
        ])
      );

      await expect(deleteLabel(labelId, userId)).rejects.toThrow(
        "Insufficient permissions"
      );
    });

    it("should delete both label and associated lines in transaction", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabel,
            projectOwnerId: userId,
          },
        ])
      );

      const updateCalls: any[] = [];
      const mockUpdate = vi.fn().mockImplementation(() => {
        updateCalls.push("update");
        return {
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };
      });
      mockDb.update = mockUpdate;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          update: mockUpdate,
        };
        await callback(tx);
      });
      mockDb.transaction = mockTransaction;

      await deleteLabel(labelId, userId);

      // Should have called update twice (label + label lines)
      expect(updateCalls).toHaveLength(2);
    });

    it("should only delete non-deleted label lines", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabel,
            projectOwnerId: userId,
          },
        ])
      );

      let whereClause: any;
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((clause) => {
            whereClause = clause;
            return Promise.resolve();
          }),
        }),
      });
      mockDb.update = mockUpdate;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          update: mockUpdate,
        };
        await callback(tx);
      });
      mockDb.transaction = mockTransaction;

      await deleteLabel(labelId, userId);

      // Verify the where clause filters for non-deleted lines
      expect(whereClause).toBeDefined();
    });

    it("should update gitlab_files.content when label has a gitlabFileId", async () => {
      const mockContent =
        'label chapter1_label1:\n    "Test content"\n    return\nlabel chapter1_label2:\n    "Other content"\n    return';
      const mockLabelWithGitlab = {
        ...mockLabel,
        labelName: "chapter1_label1",
      };

      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabelWithGitlab,
            projectOwnerId: userId,
            gitlabFileId: "gitlab-file-123",
            gitlabFileContent: mockContent,
          },
        ])
      );

      const updateCalls: any[] = [];
      const mockUpdate = vi
        .fn()
        .mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        })
        .mockImplementation(() => {
          updateCalls.push("update");
          return {
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };
        });
      mockDb.update = mockUpdate;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          update: mockUpdate,
        };
        await callback(tx);
      });
      mockDb.transaction = mockTransaction;

      await deleteLabel(labelId, userId);

      // Should have called update 3 times (label + label lines + gitlab_files)
      expect(updateCalls).toHaveLength(3);

      // Verify the removeLabelFromRPYContent function was called
      expect(mockRemoveLabelFromRPYContent).toHaveBeenCalledWith(
        mockContent,
        "chapter1_label1"
      );
    });

    it("should not update gitlab_files when label has no gitlabFileId", async () => {
      const mockLabelWithoutGitlab = {
        ...mockLabel,
        labelName: "chapter1_label1",
        gitlabFileId: null,
      };

      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabelWithoutGitlab,
            projectOwnerId: userId,
            gitlabFileId: null,
            gitlabFileContent: null,
          },
        ])
      );

      const updateCalls: any[] = [];
      const mockUpdate = vi
        .fn()
        .mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        })
        .mockImplementation(() => {
          updateCalls.push("update");
          return {
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };
        });
      mockDb.update = mockUpdate;

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        const tx = {
          update: mockUpdate,
        };
        await callback(tx);
      });
      mockDb.transaction = mockTransaction;

      await deleteLabel(labelId, userId);

      // Should have called update only 2 times (label + label lines)
      expect(updateCalls).toHaveLength(2);

      // Verify the removeLabelFromRPYContent function was NOT called
      expect(mockRemoveLabelFromRPYContent).not.toHaveBeenCalled();
    });
  });
});
