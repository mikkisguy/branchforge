/**
 * Labels Service Unit Tests
 *
 * Tests for the labels business logic layer.
 *
 * NOTE: Database operation tests (listLabels, getLabel, createLabel, updateLabel, deleteLabel)
 * have been migrated to integration tests. These unit tests now focus on:
 * - Data transformation logic (mapToPublicLabel)
 * - GitLab file sync integration (RPY parser)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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

// Additional mocks for deleteLabel tests (GitLab file sync)
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
  transaction: mockTransaction,
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

  const _mockLabelLine: LabelLineWithSpeaker = {
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
  // GitLab file sync tests (deleteLabel with RPY parser integration)
  // These tests verify the GitLab file sync behavior when deleting labels
  // ============================================================================

  describe("deleteLabel - GitLab file sync", () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
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
