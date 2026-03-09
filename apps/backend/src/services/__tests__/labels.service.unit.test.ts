/**
 * Labels Service Unit Tests
 *
 * Tests for the labels business logic layer.
 * Tests listing labels, getting label details, and authorization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as dbModule from "../../db/index.js";

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
  authorizeLabelAccess,
  type LabelDetail,
  type LabelLineWithSpeaker,
} from "../labels.service.js";

// Mock the database with a complete chain builder
const createMockChain = (resolveValue: any) => {
  const result = Promise.resolve(resolveValue);

  // Helper to create chain methods that preserve join capability
  const createJoinMethods = () => ({
    where: vi.fn(() =>
      Object.assign(result, {
        orderBy: vi.fn(() => result),
        limit: vi.fn(() => result),
      }),
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
        createMockChain([labelWithInvalidStatus]),
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
        createMockChain([labelWithValidValues]),
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
        createMockChain([labelWithNullValues]),
      );

      const labels = await listLabels(projectId, userId);

      expect(labels).toHaveLength(1);
      expect(labels[0].routeKey).toBeNull();
      expect(labels[0].status).toBeNull();
    });
  });
});
