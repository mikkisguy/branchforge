import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { charactersService } from "../characters.service.js";
import { characters } from "../../db/schema/index.js";
import type { ImportCharactersInput } from "../../lib/validation.js";

// ============================================================================
// Mocks
// ============================================================================

// Mock requireProjectOwnership as a no-op
vi.mock("../authz.service.js", () => ({
  requireProjectOwnership: vi.fn(() => Promise.resolve()),
}));

// Chain builders for DB operations
const createSelectChain = (resolveValue: unknown[]) => ({
  from: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve(resolveValue)),
  })),
});

const createInsertChain = () => ({
  values: vi.fn(() => ({
    onConflictDoUpdate: vi.fn(() => Promise.resolve()),
  })),
});

// Mock DB functions
const mockSelect = vi.fn(() => createSelectChain([]));
const mockInsert = vi.fn(createInsertChain);
const mockUpdate = vi.fn();

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  })),
}));

// ============================================================================
// Tests
// ============================================================================

describe("CharactersService.importCharacters", () => {
  const projectId = "project-123";
  const userId = "user-123";

  const existingCharacter = {
    id: "char-eileen",
    projectId,
    name: "Eileen",
    displayName: "Eileen",
    renpyTag: "eileen",
    color: "#888888",
    routeAffiliation: null,
    isLoveInterest: false,
    isNarrator: false,
    pairGroupId: null,
    dialogueStyle: null,
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  let updateSetFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSetFn = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    mockUpdate.mockReturnValue({ set: updateSetFn });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("existing character update — isNarrator behavior", () => {
    it("should NOT include isNarrator when omitted from input (undefined)", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            // routeAffiliation omitted (optional)
            // isNarrator is NOT provided (undefined)
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(characters);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).not.toHaveProperty("isNarrator");
    });

    it("should include isNarrator set to true when explicitly provided", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            isNarrator: true,
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).toHaveProperty("isNarrator");
      expect(updatesArg.isNarrator).toBe(true);
    });

    it("should include isNarrator set to false when explicitly provided", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            isNarrator: false,
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).toHaveProperty("isNarrator");
      expect(updatesArg.isNarrator).toBe(false);
    });
  });

  describe("existing character update — isLoveInterest behavior", () => {
    it("should NOT include isLoveInterest when omitted from input (undefined)", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            // isLoveInterest is NOT provided (undefined)
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).not.toHaveProperty("isLoveInterest");
    });

    it("should include isLoveInterest set to true when explicitly provided", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            isLoveInterest: true,
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).toHaveProperty("isLoveInterest");
      expect(updatesArg.isLoveInterest).toBe(true);
    });

    it("should include isLoveInterest set to false when explicitly provided", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            isLoveInterest: false,
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).toHaveProperty("isLoveInterest");
      expect(updatesArg.isLoveInterest).toBe(false);
    });
  });

  describe("existing character update — combined scenarios", () => {
    it("should omit both isNarrator and isLoveInterest when both are omitted", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            // Both omitted
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).not.toHaveProperty("isNarrator");
      expect(updatesArg).not.toHaveProperty("isLoveInterest");
    });

    it("should include both fields when both are explicitly provided", async () => {
      mockSelect.mockImplementation(() =>
        createSelectChain([existingCharacter])
      );

      const input: ImportCharactersInput = {
        characters: [
          {
            tag: "eileen",
            name: "Eileen Updated",
            displayName: "Eileen Updated",
            color: "#00FF00",
            isNarrator: true,
            isLoveInterest: false,
          },
        ],
        excludedTags: [],
        narratorTags: [],
        linkToLines: false,
      };

      await charactersService.importCharacters(projectId, userId, input);

      const updatesArg = updateSetFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updatesArg).toHaveProperty("isNarrator");
      expect(updatesArg.isNarrator).toBe(true);
      expect(updatesArg).toHaveProperty("isLoveInterest");
      expect(updatesArg.isLoveInterest).toBe(false);
    });
  });
});
