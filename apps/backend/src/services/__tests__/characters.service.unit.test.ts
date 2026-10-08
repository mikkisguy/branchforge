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

// Mock project locking — the import transaction locks the project row
vi.mock("../project-files-operations.service.js", () => ({
  lockProject: vi.fn(() => Promise.resolve()),
}));

// Keep the pure source-preservation helpers real; only the DB-touching
// maintenance entry point is stubbed out.
vi.mock(
  "../character-source-preservation.service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../character-source-preservation.service.js")
      >();
    return {
      ...actual,
      ensureCharacterSourcePreservation: vi.fn(() => Promise.resolve()),
    };
  }
);

// Hoist all mock variables so vi.mock factories can access them
const {
  mockInsert,
  mockUpdate,
  mockGetDb,
  mockTransactionFn,
  mockLinkSpeakersToLines,
  setSelectResults,
  resetSelectResults,
  createInsertChain,
} = vi.hoisted(() => {
  /** Identify a drizzle table object by one of its unique column names. */
  const tableKey = (table: unknown): string => {
    const t = table as Record<string, unknown> | null;
    if (!t || typeof t !== "object") {
      throw new Error("Expected a Drizzle table in select mock");
    }
    if ("excludedCharacterTags" in t) return "projectSettings";
    if ("filePath" in t) return "projectFiles";
    if ("renpyTag" in t) return "characters";
    if ("labelName" in t) return "labels";
    throw new Error("Unmapped Drizzle table in select mock");
  };

  const selectResults: Record<string, unknown[]> = {};

  const setSelectResults = (results: Record<string, unknown[]>) => {
    for (const [key, value] of Object.entries(results)) {
      selectResults[key] = value;
    }
  };

  const resetSelectResults = () => {
    for (const key of Object.keys(selectResults)) {
      delete selectResults[key];
    }
  };

  const createInsertChain = () => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => Promise.resolve()),
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      returning: vi.fn(() => Promise.resolve([] as unknown[])),
    })),
  });

  const mockSelect = vi.fn(() => ({
    from: vi.fn((table?: unknown) => {
      const resolveValue = selectResults[tableKey(table)] ?? [];
      const whereResult = Object.assign(Promise.resolve(resolveValue), {
        limit: vi.fn(() => Promise.resolve(resolveValue)),
      });
      return {
        where: vi.fn(() => whereResult),
      };
    }),
  }));

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
    mockSelect,
    mockInsert,
    mockUpdate,
    mockGetDb,
    mockTransactionFn,
    mockLinkSpeakersToLines,
    setSelectResults,
    resetSelectResults,
    createInsertChain,
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
    isLoveInterest: false,
    isNarrator: false,
    pairGroupId: null,
    notes: null,
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
    isLoveInterest: false,
    isNarrator: false,
    pairGroupId: null,
    notes: null,
    avatarUrl: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  let updateSetFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSelectResults();
    mockInsert.mockReset();
    mockInsert.mockImplementation(createInsertChain);
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

  /** Stub the DB selects so the existing-character lookup returns a match. */
  function stubExistingCharacter() {
    setSelectResults({
      // Must match buildInput's excludedTags so no ownership reconcile runs
      projectSettings: [{ excludedCharacterTags: [] }],
      projectFiles: [],
      characters: [existingCharacter],
    });
  }

  /** Stub the DB insert to return a new character (creating path). */
  function stubNewCharacter() {
    setSelectResults({
      projectSettings: [{ excludedCharacterTags: [] }],
      projectFiles: [],
      characters: [],
    });
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
      setSelectResults({ labels: [{ id: "label-1" }] });

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
      setSelectResults({ labels: [{ id: "label-1" }] });
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

describe("CharactersService.detectCharacters", () => {
  const projectId = "project-123";
  const userId = "user-123";

  beforeEach(() => {
    resetSelectResults();
    // Restore the default insert chain — the new-character creation tests
    // override it via mockReturnValue, which survives clearAllMocks.
    mockInsert.mockReset();
    mockInsert.mockImplementation(createInsertChain);
    // Select results by table: projectSettings (via getProjectSettings),
    // characters, projectFiles
    const settingsRow = {
      projectId,
      excludedCharacterTags: ["n", "u", "narrator", "extend"],
      narratorCharacterTags: [],
      autoLinkSpeakers: true,
    };
    const projectFilesRows = [
      {
        source: "GITLAB",
        filePath: "game/gui.rpy",
        content:
          'define quick_menu = True\ndefine narrator_char = Character("Narrator")',
        originalContent: null,
        remoteContent: null,
        hasRemoteConflict: false,
      },
      {
        source: "GITLAB",
        filePath: "game/script.rpy",
        content: 'define story_char = Character("Story")',
        originalContent: null,
        remoteContent: null,
        hasRemoteConflict: false,
      },
    ];
    setSelectResults({
      projectSettings: [settingsRow],
      characters: [],
      projectFiles: projectFilesRows,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("excludes source-owned standard files from detection", async () => {
    const result = await charactersService.detectCharacters(projectId, userId);

    expect(result.characters.map((c) => c.tag)).toEqual(["story_char"]);
    expect(result.characters.map((c) => c.tag)).not.toContain("narrator_char");
  });
});

describe("CharactersService.updateCharacter", () => {
  const characterId = "char-boss";
  const userId = "user-123";

  const variableCharacter = {
    id: characterId,
    projectId: "project-123",
    name: "Old Boss",
    displayName: "Old Boss",
    nameType: "variable",
    renpyTag: "boss",
    color: "#ff0000",
    isLoveInterest: false,
    isNarrator: false,
    pairGroupId: null,
    notes: null,
    avatarUrl: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  let updateSetFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSelectResults();
    setSelectResults({ characters: [variableCharacter] });

    updateSetFn = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() =>
          Promise.resolve([
            {
              ...variableCharacter,
              name: "boss_name",
              displayName: "boss_name",
            },
          ])
        ),
      })),
    }));
    mockUpdate.mockReturnValue({ set: updateSetFn });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves variable nameType when updating name to a bare identifier without nameType", async () => {
    await charactersService.updateCharacter(characterId, userId, {
      name: "boss_name",
    });

    expect(mockUpdate).toHaveBeenCalledWith(characters);
    const setArg = updateSetFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.name).toBe("boss_name");
    expect(setArg).not.toHaveProperty("nameType");
  });

  it("downgrades variable nameType to literal when renaming to an unsafe identifier", async () => {
    updateSetFn = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() =>
          Promise.resolve([
            {
              ...variableCharacter,
              name: "The Big Boss",
              displayName: "The Big Boss",
              nameType: "literal",
            },
          ])
        ),
      })),
    }));
    mockUpdate.mockReturnValue({ set: updateSetFn });

    await charactersService.updateCharacter(characterId, userId, {
      name: "The Big Boss",
    });

    expect(mockUpdate).toHaveBeenCalledWith(characters);
    const setArg = updateSetFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.name).toBe("The Big Boss");
    expect(setArg.nameType).toBe("literal");
  });
});
