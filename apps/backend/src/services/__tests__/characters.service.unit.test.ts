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

  // --------------------------------------------------------------------------
  // Shared test helpers for the import path
  // --------------------------------------------------------------------------

  /** Stub the DB select so the existing-character lookup returns a match. */
  function stubExistingCharacter() {
    mockSelect.mockImplementation(() => createSelectChain([existingCharacter]));
  }

  /** Build an import input with sensible defaults, overriding as needed. */
  function buildInput(
    charOverrides: Partial<ImportCharactersInput["characters"][number]> = {}
  ): ImportCharactersInput {
    return {
      characters: [
        {
          tag: "eileen",
          name: "Eileen Updated",
          displayName: "Eileen Updated",
          color: "#00FF00",
          ...charOverrides,
        },
      ],
      excludedTags: [],
      narratorTags: [],
      linkToLines: false,
    };
  }

  /** Extract the argument passed to `db.update().set()` after an import call. */
  function getUpdatesArg(): Record<string, unknown> {
    return updateSetFn.mock.calls[0][0] as Record<string, unknown>;
  }

  // --------------------------------------------------------------------------
  // isNarrator behavior
  // --------------------------------------------------------------------------

  describe("existing character update — isNarrator behavior", () => {
    it("should NOT include isNarrator when omitted from input (undefined)", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(projectId, userId, buildInput());

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(characters);
      expect(getUpdatesArg()).not.toHaveProperty("isNarrator");
    });

    it("should include isNarrator set to true when explicitly provided", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(
        projectId,
        userId,
        buildInput({ isNarrator: true })
      );

      const arg = getUpdatesArg();
      expect(arg).toHaveProperty("isNarrator");
      expect(arg.isNarrator).toBe(true);
    });

    it("should include isNarrator set to false when explicitly provided", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(
        projectId,
        userId,
        buildInput({ isNarrator: false })
      );

      const arg = getUpdatesArg();
      expect(arg).toHaveProperty("isNarrator");
      expect(arg.isNarrator).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // isLoveInterest behavior
  // --------------------------------------------------------------------------

  describe("existing character update — isLoveInterest behavior", () => {
    it("should NOT include isLoveInterest when omitted from input (undefined)", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(projectId, userId, buildInput());

      expect(getUpdatesArg()).not.toHaveProperty("isLoveInterest");
    });

    it("should include isLoveInterest set to true when explicitly provided", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(
        projectId,
        userId,
        buildInput({ isLoveInterest: true })
      );

      const arg = getUpdatesArg();
      expect(arg).toHaveProperty("isLoveInterest");
      expect(arg.isLoveInterest).toBe(true);
    });

    it("should include isLoveInterest set to false when explicitly provided", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(
        projectId,
        userId,
        buildInput({ isLoveInterest: false })
      );

      const arg = getUpdatesArg();
      expect(arg).toHaveProperty("isLoveInterest");
      expect(arg.isLoveInterest).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Combined scenarios
  // --------------------------------------------------------------------------

  describe("existing character update — combined scenarios", () => {
    it("should omit both isNarrator and isLoveInterest when both are omitted", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(projectId, userId, buildInput());

      const arg = getUpdatesArg();
      expect(arg).not.toHaveProperty("isNarrator");
      expect(arg).not.toHaveProperty("isLoveInterest");
    });

    it("should include both fields when both are explicitly provided", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(
        projectId,
        userId,
        buildInput({ isNarrator: true, isLoveInterest: false })
      );

      const arg = getUpdatesArg();
      expect(arg).toHaveProperty("isNarrator");
      expect(arg.isNarrator).toBe(true);
      expect(arg).toHaveProperty("isLoveInterest");
      expect(arg.isLoveInterest).toBe(false);
    });
  });
});
