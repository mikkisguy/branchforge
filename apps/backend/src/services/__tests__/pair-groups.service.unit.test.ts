/**
 * Pair Groups Service Unit Tests
 *
 * Tests the pair-groups.service.ts CRUD operations with mocked dependencies.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  listPairGroups,
  getPairGroup,
  createPairGroup,
  updatePairGroup,
  deletePairGroup,
} from "../pair-groups.service.js";
import {
  ConflictError,
  NotFoundError,
} from "../../middleware/error-handler.middleware.js";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../authz.service.js", () => ({
  requireProjectOwnership: vi.fn(() => Promise.resolve()),
}));

/**
 * Create a thenable proxy that mimics a Drizzle query chain.
 * Any property access returns a function that returns a new chain.
 * Awaiting the chain resolves to resolveValue.
 */
function chain(resolveValue: unknown): any {
  const fn = ((..._args: unknown[]) => {
    return chain(resolveValue);
  }) as any;

  return new Proxy(fn, {
    get(_target, prop, _receiver) {
      if (prop === "then") {
        return (
          resolve: (v: unknown) => void,
          reject?: (e: unknown) => void
        ) => {
          if (resolveValue instanceof Error) {
            reject?.(resolveValue);
          } else {
            resolve?.(resolveValue);
          }
        };
      }
      if (prop === "catch") {
        return (reject?: (e: unknown) => void) => {
          if (resolveValue instanceof Error) {
            reject?.(resolveValue);
          }
          return undefined;
        };
      }
      return chain(resolveValue);
    },
  });
}

// Mock database methods
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbUpdate = vi.fn();
const dbDelete = vi.fn();

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    select: dbSelect,
    insert: dbInsert,
    update: dbUpdate,
    delete: dbDelete,
  })),
}));

// ============================================================================
// Fixtures
// ============================================================================

const projectId = "project-001";
const userId = "user-001";

function makePairGroupRow(
  overrides: Partial<{
    id: string;
    projectId: string;
    characterAId: string;
    characterBId: string;
    duoEndingLabel: string;
  }> = {}
) {
  return {
    id: overrides.id ?? "pg-001",
    projectId: overrides.projectId ?? projectId,
    characterAId: overrides.characterAId ?? "char-a",
    characterBId: overrides.characterBId ?? "char-b",
    duoEndingLabel: overrides.duoEndingLabel ?? "best_friends",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };
}

function makeCharRow(id: string, displayName: string) {
  return { id, displayName };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty select results
  dbSelect.mockReturnValue(chain([]));
  dbInsert.mockReturnValue(chain([]));
  dbUpdate.mockReturnValue(chain([]));
  dbDelete.mockReturnValue(chain([]));
});

// ============================================================================
// listPairGroups
// ============================================================================

describe("listPairGroups", () => {
  it("returns empty array when no pair groups exist", async () => {
    dbSelect.mockReturnValue(chain([]));

    const result = await listPairGroups(projectId, userId);
    expect(result).toEqual([]);
  });

  it("returns pair groups with character names", async () => {
    const pg = makePairGroupRow();
    const charA = makeCharRow("char-a", "Alice");
    const charB = makeCharRow("char-b", "Bob");

    // First select: pair groups, second select: character names
    dbSelect
      .mockReturnValueOnce(chain([pg]))
      .mockReturnValueOnce(chain([charA, charB]));

    const result = await listPairGroups(projectId, userId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pg-001",
      duoEndingLabel: "best_friends",
      characterAName: "Alice",
      characterBName: "Bob",
    });
  });
});

// ============================================================================
// getPairGroup
// ============================================================================

describe("getPairGroup", () => {
  it("returns null when pair group not found", async () => {
    dbSelect.mockReturnValue(chain([]));

    const result = await getPairGroup("nonexistent", userId);
    expect(result).toBeNull();
  });

  it("returns pair group with character names when found", async () => {
    const pg = makePairGroupRow();
    dbSelect
      .mockReturnValueOnce(chain([pg]))
      .mockReturnValueOnce(
        chain([makeCharRow("char-a", "Alice"), makeCharRow("char-b", "Bob")])
      );

    const result = await getPairGroup("pg-001", userId);
    expect(result).not.toBeNull();
    expect(result!.characterAName).toBe("Alice");
    expect(result!.characterBName).toBe("Bob");
  });
});

// ============================================================================
// createPairGroup
// ============================================================================

describe("createPairGroup", () => {
  it("creates a pair group with canonical character ordering", async () => {
    // Character existence check
    dbSelect.mockReturnValueOnce(
      chain([makeCharRow("char-a", "Alice"), makeCharRow("char-b", "Bob")])
    );

    const created = makePairGroupRow({
      characterAId: "char-a",
      characterBId: "char-b",
    });
    dbInsert.mockReturnValue(chain([created]));

    const result = await createPairGroup(projectId, userId, {
      characterAId: "char-b", // reversed order
      characterBId: "char-a",
      duoEndingLabel: "best_friends",
    });

    // Should have swapped to canonical order (a < b)
    expect(result.characterAId).toBe("char-a");
    expect(result.characterBId).toBe("char-b");
    expect(result.duoEndingLabel).toBe("best_friends");
  });

  it("throws NotFoundError when character not found in project", async () => {
    dbSelect.mockReturnValueOnce(chain([makeCharRow("char-a", "Alice")]));

    await expect(
      createPairGroup(projectId, userId, {
        characterAId: "char-a",
        characterBId: "nonexistent",
        duoEndingLabel: "test",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError on duplicate pair", async () => {
    dbSelect.mockReturnValueOnce(
      chain([makeCharRow("char-a", "Alice"), makeCharRow("char-b", "Bob")])
    );

    const dupError = new Error("duplicate key value") as Error & {
      code: string;
    };
    dupError.code = "23505";
    // Make insert throw by setting the chain to resolve to an Error
    dbInsert.mockReturnValue(chain(dupError));

    await expect(
      createPairGroup(projectId, userId, {
        characterAId: "char-a",
        characterBId: "char-b",
        duoEndingLabel: "test",
      })
    ).rejects.toThrow(ConflictError);
  });
});

// ============================================================================
// updatePairGroup
// ============================================================================

describe("updatePairGroup", () => {
  it("updates duoEndingLabel", async () => {
    const existing = makePairGroupRow();
    dbSelect.mockReturnValueOnce(chain([existing]));

    const updated = {
      ...existing,
      duoEndingLabel: "new_ending",
      updatedAt: new Date(),
    };
    dbUpdate.mockReturnValue(chain([updated]));

    const result = await updatePairGroup("pg-001", userId, {
      duoEndingLabel: "new_ending",
    });

    expect(result.duoEndingLabel).toBe("new_ending");
  });

  it("throws NotFoundError when pair group does not exist", async () => {
    dbSelect.mockReturnValueOnce(chain([]));

    await expect(
      updatePairGroup("nonexistent", userId, { duoEndingLabel: "test" })
    ).rejects.toThrow(NotFoundError);
  });
});

// ============================================================================
// deletePairGroup
// ============================================================================

describe("deletePairGroup", () => {
  it("deletes an existing pair group", async () => {
    dbSelect.mockReturnValueOnce(chain([makePairGroupRow()]));
    dbDelete.mockReturnValue(chain(undefined));

    await expect(deletePairGroup("pg-001", userId)).resolves.toBeUndefined();
  });

  it("throws NotFoundError when pair group does not exist", async () => {
    dbSelect.mockReturnValueOnce(chain([]));

    await expect(deletePairGroup("nonexistent", userId)).rejects.toThrow(
      NotFoundError
    );
  });
});
