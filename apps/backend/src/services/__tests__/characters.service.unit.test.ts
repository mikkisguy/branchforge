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

// Hoist all mock variables so vi.mock factories can access them
const {
  createSelectChain,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockGetDb,
  mockTransactionFn,
  mockLinkSpeakersToLines,
} = vi.hoisted(() => {
  const createSelectChain = (resolveValue: unknown[]) => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(resolveValue)),
    })),
  });

  const createInsertChain = () => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      returning: vi.fn(() => Promise.resolve([] as unknown[])),
    })),
  });

  const mockSelect = vi.fn(() => createSelectChain([]));
  const mockInsert = vi.fn(createInsertChain);
  const mockUpdate = vi.fn();
  const mockTransactionFn = vi.fn((cb: (tx: unknown) => unknown) =>
    cb({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    })
  );
  const mockGetDb = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransactionFn,
  }));
  const mockLinkSpeakersToLines = vi.fn(() =>
    Promise.resolve({ linked: 0, unmatched: [], conflicts: [] })
  );

  return {
    createSelectChain,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockGetDb,
    mockTransactionFn,
    mockLinkSpeakersToLines,
  };
});

// Mock characterLinkerService to capture calls
vi.mock("../character-linker.service.js", () => ({
  characterLinkerService: {
    linkSpeakersToLines: mockLinkSpeakersToLines,
  },
}));

vi.mock("../../db/index.js", () => ({
  getDb: mockGetDb,
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
    notes: null,
    conditionalPrefix: null,
    avatarUrl: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  const newCharacter = {
    id: "char-new",
    projectId,
    name: "New",
    displayName: "New",
    renpyTag: "new",
    color: "#FFFFFF",
    routeAffiliation: null,
    isLoveInterest: false,
    isNarrator: false,
    pairGroupId: null,
    notes: null,
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

  /** Stub the DB insert to return a new character (creating path). */
  function stubNewCharacter() {
    // select returns empty → no existing match, so create path is taken
    mockSelect.mockImplementation(() => createSelectChain([]));
    // insert.returning returns the new character
    mockInsert.mockReturnValue({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
        returning: vi.fn(() => Promise.resolve([newCharacter])),
      })),
    });
  }

  /** Build an import input with sensible defaults, overriding as needed. */
  function buildInput(
    charOverrides: Partial<ImportCharactersInput["characters"][number]> = {},
    importOverrides: Partial<ImportCharactersInput> = {}
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
      ...importOverrides,
    };
  }

  /** Extract the argument passed to `db.update().set()` after an import call. */
  function getUpdatesArg(): Record<string, unknown> {
    return updateSetFn.mock.calls[0][0] as Record<string, unknown>;
  }

  // --------------------------------------------------------------------------
  // Transaction wrapping
  // --------------------------------------------------------------------------

  describe("transaction wrapping", () => {
    it("should wrap import in a transaction", async () => {
      stubExistingCharacter();

      await charactersService.importCharacters(projectId, userId, buildInput());

      expect(mockGetDb).toHaveBeenCalled();
      expect(mockTransactionFn).toHaveBeenCalledTimes(1);
    });
  });

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

  // --------------------------------------------------------------------------
  // New character creation (tag not found)
  // --------------------------------------------------------------------------

  describe("new character creation", () => {
    it("should create a new character when tag is not found", async () => {
      stubNewCharacter();

      const result = await charactersService.importCharacters(
        projectId,
        userId,
        buildInput()
      );

      expect(mockInsert).toHaveBeenCalledWith(characters);
      expect(result.characters).toHaveLength(1);
      expect(result.characters[0]).toMatchObject({
        id: "char-new",
        tag: "new",
        name: "New",
        displayName: "New",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Transaction passing to linker
  // --------------------------------------------------------------------------

  describe("linker integration", () => {
    it("should pass transaction to linker when linkToLines is true", async () => {
      stubExistingCharacter();
      // Labels select must return at least one label for the linker path
      mockSelect.mockImplementation((_table?: unknown) => {
        // The second select call in the import flow is for labels
        // Return one label to trigger the linker call
        return createSelectChain([{ id: "label-1" }]);
      });

      await charactersService.importCharacters(
        projectId,
        userId,
        buildInput({}, { linkToLines: true })
      );

      expect(mockLinkSpeakersToLines).toHaveBeenCalledTimes(1);
      // Verify the 4th argument (tx) is truthy — it's the transaction object
      const calls = mockLinkSpeakersToLines.mock.calls[0] as unknown[];
      const txArg = calls[3];
      expect(txArg).toBeDefined();
      expect(txArg).toHaveProperty("select");
      expect(txArg).toHaveProperty("insert");
      expect(txArg).toHaveProperty("update");
    });

    it("should propagate linker errors when linkToLines is true", async () => {
      stubExistingCharacter();
      mockSelect.mockImplementation((_table?: unknown) => {
        return createSelectChain([{ id: "label-1" }]);
      });
      mockLinkSpeakersToLines.mockRejectedValueOnce(
        new Error("Speaker linking failed")
      );

      await expect(
        charactersService.importCharacters(
          projectId,
          userId,
          buildInput({}, { linkToLines: true })
        )
      ).rejects.toThrow("Speaker linking failed");
    });
  });
});
