/**
 * Labels Service Unit Tests
 *
 * Tests for the labels business logic layer.
 *
 * NOTE: Database operation tests (listLabels, getLabel, createLabel, updateLabel, deleteLabel)
 * have been migrated to integration tests. These unit tests now focus on:
 * - Data transformation logic (mapToPublicLabel)
 * - Project file sync integration (RPY parser)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RENPY_LABEL_REGEX } from "@branchforge/shared";

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
  deleteLabel,
  getLabelCharacters,
  addCharacterToLabel,
  updateCharacterInLabel,
  removeCharacterFromLabel,
} from "../labels.service.js";

// Mock the RPY parser service
const mockRemoveLabelFromRPYContent = vi
  .fn()
  .mockImplementation((content: string, labelName: string) => {
    // Simple mock implementation that removes the label line
    const lines = content.split("\n");
    return lines
      .filter((line) => {
        const labelMatch = line.match(RENPY_LABEL_REGEX);
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

// Additional mocks for deleteLabel tests (project file sync)
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
  transaction: mockTransaction,
  insert: mockInsert,
  delete: mockDelete,
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Data transformation tests (mapToPublicLabel logic)
  // These tests verify the data transformation logic that happens after DB queries
  // ============================================================================

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

  // ============================================================================
  // Project file sync tests (deleteLabel with RPY parser integration)
  // These tests verify the project file sync behavior when deleting labels
  // ============================================================================

  describe("deleteLabel - project file sync", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it("should update project_files.content when label has a projectFileId", async () => {
      const mockContent =
        'label chapter1_label1:\n    "Test content"\n    return\nlabel chapter1_label2:\n    "Other content"\n    return';
      const mockLabelWithProjectFile = {
        ...mockLabel,
        labelName: "chapter1_label1",
      };

      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabelWithProjectFile,
            projectOwnerId: userId,
            projectFileId: "project-file-123",
            projectFileContent: mockContent,
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

      // Should have called update 3 times (label + label lines + project_files)
      expect(updateCalls).toHaveLength(3);

      // Verify the removeLabelFromRPYContent function was called
      expect(mockRemoveLabelFromRPYContent).toHaveBeenCalledWith(
        mockContent,
        "chapter1_label1"
      );
    });

    it("should not update project_files when label has no projectFileId", async () => {
      const mockLabelWithoutProjectFile = {
        ...mockLabel,
        labelName: "chapter1_label1",
      };

      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: mockLabelWithoutProjectFile,
            projectOwnerId: userId,
            projectFileId: null,
            projectFileContent: null,
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

  // ============================================================================
  // Label-Character Association Service Tests
  // ============================================================================

  describe("getLabelCharacters", () => {
    const mockCharacters = [
      {
        id: "char-1",
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
      },
      {
        id: "char-2",
        name: "antagonist",
        displayName: "Antagonist",
        renpyTag: "a",
      },
    ];

    const mockLabelCharacters = [
      {
        character: mockCharacters[0],
        notes: "Main character",
      },
      {
        character: mockCharacters[1],
        notes: "Villain",
      },
    ];

    it("should return characters for a label when user has access", async () => {
      // Mock label query and characters query
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        // For label with project query (first call)
        if (callCount === 1) {
          return createMockChain([{ projectOwnerId: userId }]); // Simulate label ownership
        }
        // For labelCharactersTable query (second call)
        return createMockChain(mockLabelCharacters);
      });

      const result = await getLabelCharacters(labelId, userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "char-1",
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        notes: "Main character",
      });
    });

    it("should throw NotFoundError when label not found", async () => {
      // Mock label query to return empty result
      mockSelect.mockImplementation(createEmptyMockChain);

      await expect(getLabelCharacters(labelId, userId)).rejects.toThrow(
        "Label"
      );
    });

    it("should throw ForbiddenError when user lacks access", async () => {
      // Mock label query with different owner
      mockSelect.mockImplementation(() =>
        createMockChain([{ projectOwnerId: "other-user" }])
      );

      await expect(getLabelCharacters(labelId, userId)).rejects.toThrow(
        "Insufficient permissions"
      );
    });
  });

  describe("addCharacterToLabel", () => {
    const mockCharacter = {
      id: "char-1",
      name: "protagonist",
      displayName: "Protagonist",
      renpyTag: "p",
    };

    const mockLabelWithProject = {
      label: { id: labelId, projectId },
      projectOwnerId: userId,
    };

    it("should successfully add character to label", async () => {
      // Mock insert operation
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              labelId,
              characterId: "char-1",
              notes: null,
            },
          ]),
        }),
      });

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get label with project
          return createMockChain([mockLabelWithProject]);
        } else if (callCount === 2) {
          // Second call: check character exists
          return createMockChain([mockCharacter]);
        } else if (callCount === 3) {
          // Third call: check existing association
          return createMockChain([]);
        } else {
          // Fourth call: fetch result with character info
          return createMockChain([
            {
              character: mockCharacter,
              notes: "Main character",
            },
          ]);
        }
      });

      const result = await addCharacterToLabel(labelId, "char-1", userId, {
        notes: "Main character",
      });

      expect(result).toEqual({
        id: "char-1",
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        notes: "Main character",
      });

      expect(mockInsert).toHaveBeenCalled();
    });

    it("should throw NotFoundError when label not found", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      await expect(
        addCharacterToLabel(labelId, "char-1", userId, {})
      ).rejects.toThrow("Label");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: { id: labelId, projectId },
            projectOwnerId: "other-user",
          },
        ])
      );

      await expect(
        addCharacterToLabel(labelId, "char-1", userId, {})
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should throw NotFoundError when character not found", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChain([mockLabelWithProject]);
        } else {
          return createMockChain([]);
        }
      });

      await expect(
        addCharacterToLabel(labelId, "char-1", userId, {})
      ).rejects.toThrow("Character");
    });

    it("should throw ConflictError when character already associated", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChain([mockLabelWithProject]);
        } else if (callCount === 2) {
          return createMockChain([mockCharacter]);
        } else {
          return createMockChain([{ id: "existing" }]);
        }
      });

      await expect(
        addCharacterToLabel(labelId, "char-1", userId, {
          role: "PRIMARY",
        })
      ).rejects.toThrow("Character already associated with this label");
    });
  });

  describe("updateCharacterInLabel", () => {
    const mockCharacter = {
      id: "char-1",
      name: "protagonist",
      displayName: "Protagonist",
      renpyTag: "p",
    };

    const mockLabelWithProject = {
      label: { id: labelId, projectId },
      projectOwnerId: userId,
    };

    it("should successfully update character in label", async () => {
      // Mock update operation
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get label with project
          return createMockChain([mockLabelWithProject]);
        } else if (callCount === 2) {
          // Second call: check existing association
          return createMockChain([{ id: "existing" }]);
        } else {
          // Third call: fetch result with character info
          return createMockChain([
            {
              character: mockCharacter,
              notes: "Updated notes",
            },
          ]);
        }
      });

      const result = await updateCharacterInLabel(labelId, "char-1", userId, {
        notes: "Updated notes",
      });

      expect(result).toEqual({
        id: "char-1",
        name: "protagonist",
        displayName: "Protagonist",
        renpyTag: "p",
        notes: "Updated notes",
      });
    });

    it("should throw NotFoundError when label not found", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      await expect(
        updateCharacterInLabel(labelId, "char-1", userId, {})
      ).rejects.toThrow("Label");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: { id: labelId, projectId },
            projectOwnerId: "other-user",
          },
        ])
      );

      await expect(
        updateCharacterInLabel(labelId, "char-1", userId, {})
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should throw NotFoundError when association not found", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChain([mockLabelWithProject]);
        } else {
          return createMockChain([]);
        }
      });

      await expect(
        updateCharacterInLabel(labelId, "char-1", userId, {})
      ).rejects.toThrow("Label character association");
    });
  });

  describe("removeCharacterFromLabel", () => {
    const mockLabelWithProject = {
      label: { id: labelId, projectId },
      projectOwnerId: userId,
    };

    it("should successfully remove character from label", async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "deleted" }]),
        }),
      });

      mockDb.delete = mockDelete;
      mockSelect.mockImplementation(() =>
        createMockChain([mockLabelWithProject])
      );

      await removeCharacterFromLabel(labelId, "char-1", userId);

      expect(mockDelete).toHaveBeenCalled();
    });

    it("should throw NotFoundError when label not found", async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      await expect(
        removeCharacterFromLabel(labelId, "char-1", userId)
      ).rejects.toThrow("Label");
    });

    it("should throw ForbiddenError when user is not project owner", async () => {
      mockSelect.mockImplementation(() =>
        createMockChain([
          {
            label: { id: labelId, projectId },
            projectOwnerId: "other-user",
          },
        ])
      );

      await expect(
        removeCharacterFromLabel(labelId, "char-1", userId)
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should throw NotFoundError when association not found", async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockDb.delete = mockDelete;

      // Mock label query (authorization check)
      mockSelect.mockImplementation(() =>
        createMockChain([mockLabelWithProject])
      );

      await expect(
        removeCharacterFromLabel(labelId, "char-1", userId)
      ).rejects.toThrow("Label character association");
    });
  });
});
