/**
 * User Settings Service Unit Tests
 *
 * Tests for the user settings service functions:
 * - getUserSettings: returns defaults when no row exists, returns existing when present
 * - updateUserSettings: creates row if missing, partial updates, returns updated values
 * - resetWritingStats: creates row if missing, clears counts
 * - ensureSettingsExist: race condition handling via onConflictDoNothing
 *
 * All database access is mocked through getDb().
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserSettings,
  updateUserSettings,
  resetWritingStats,
} from "../user-settings.service.js";
import { getDb } from "../../db/index.js";

// Mock database module
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// ============================================================================
// Mock DB Builder
// ============================================================================

/**
 * Creates a mock Drizzle database instance with chainable query builders.
 * Each query type (select, insert, update) has its own chain for isolated mocking.
 */
function createMockDb() {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

const testUserId = "123e4567-e89b-12d3-a456-426614174000";

const mockExistingRow = {
  id: "settings-id-1",
  userId: testUserId,
  avatarUrl: null,
  username: null,
  language: "en",
  theme: "light",
  dailyWritingGoal: 1000,
  dailyWordResetHour: 5,
  dailyWordCounts: [{ date: "2024-01-15", count: 500 }],
  labelWordCounts: {},
  timezone: "America/New_York",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-15"),
};

const mockDefaultRow = {
  id: "settings-id-2",
  userId: testUserId,
  avatarUrl: null,
  username: null,
  language: "en",
  theme: "light",
  dailyWritingGoal: null,
  dailyWordResetHour: 0,
  dailyWordCounts: [],
  labelWordCounts: {},
  timezone: "UTC",
  createdAt: new Date("2024-01-15"),
  updatedAt: new Date("2024-01-15"),
};

// ============================================================================
// Tests
// ============================================================================

describe("User Settings Service", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as any);
  });

  // --------------------------------------------------------------------------
  // getUserSettings
  // --------------------------------------------------------------------------

  describe("getUserSettings", () => {
    it("should return defaults when no row exists", async () => {
      // ensureSettingsExist flow: select finds nothing -> insert -> re-fetch
      mockDb._selectChain.limit
        .mockResolvedValueOnce([]) // select: no existing row
        .mockResolvedValueOnce([mockDefaultRow]); // re-fetch after insert

      const result = await getUserSettings(testUserId);

      expect(result).toEqual({
        dailyWritingGoal: null,
        dailyWordResetHour: 0,
        dailyWordCounts: [],
        timezone: "UTC",
      });

      // Verify insert was called with default values
      expect(mockDb._insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          dailyWritingGoal: null,
          dailyWordResetHour: 0,
          dailyWordCounts: [],
          timezone: "UTC",
        })
      );

      // Verify onConflictDoNothing was used (race condition protection)
      expect(mockDb._insertChain.onConflictDoNothing).toHaveBeenCalled();
    });

    it("should return existing settings when row is present", async () => {
      // ensureSettingsExist: select finds row -> return early, no insert
      mockDb._selectChain.limit.mockResolvedValueOnce([mockExistingRow]);

      const result = await getUserSettings(testUserId);

      expect(result).toEqual({
        dailyWritingGoal: 1000,
        dailyWordResetHour: 5,
        dailyWordCounts: [{ date: "2024-01-15", count: 500 }],
        timezone: "America/New_York",
      });

      // Insert should NOT have been called
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // updateUserSettings
  // --------------------------------------------------------------------------

  describe("updateUserSettings", () => {
    it("should create row if missing then update", async () => {
      const updatedRow = {
        ...mockDefaultRow,
        dailyWritingGoal: 500,
        timezone: "Europe/London",
      };

      mockDb._selectChain.limit
        .mockResolvedValueOnce([]) // ensureSettingsExist: no row
        .mockResolvedValueOnce([mockDefaultRow]) // ensureSettingsExist: after insert
        .mockResolvedValueOnce([updatedRow]); // re-fetch after update

      const result = await updateUserSettings(testUserId, {
        dailyWritingGoal: 500,
        timezone: "Europe/London",
      });

      expect(result).toEqual({
        dailyWritingGoal: 500,
        dailyWordResetHour: 0,
        dailyWordCounts: [],
        timezone: "Europe/London",
      });

      // Verify update was called
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          dailyWritingGoal: 500,
          timezone: "Europe/London",
        })
      );
    });

    it("should partial-update only provided fields", async () => {
      mockDb._selectChain.limit
        .mockResolvedValueOnce([mockExistingRow]) // ensureSettingsExist: row exists
        .mockResolvedValueOnce([
          { ...mockExistingRow, timezone: "Asia/Tokyo" },
        ]); // re-fetch after update

      const result = await updateUserSettings(testUserId, {
        timezone: "Asia/Tokyo",
      });

      expect(result.timezone).toBe("Asia/Tokyo");

      // Verify only timezone was in the update payload (plus updatedAt)
      const setCall = mockDb._updateChain.set.mock.calls[0][0];
      expect(setCall).not.toHaveProperty("dailyWritingGoal");
      expect(setCall).not.toHaveProperty("dailyWordResetHour");
      expect(setCall.timezone).toBe("Asia/Tokyo");
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });

    it("should return updated values after update", async () => {
      const updatedRow = {
        ...mockExistingRow,
        dailyWritingGoal: null,
        dailyWordResetHour: 12,
      };

      mockDb._selectChain.limit
        .mockResolvedValueOnce([mockExistingRow]) // ensureSettingsExist
        .mockResolvedValueOnce([updatedRow]); // re-fetch after update

      const result = await updateUserSettings(testUserId, {
        dailyWritingGoal: null,
        dailyWordResetHour: 12,
      });

      expect(result).toEqual({
        dailyWritingGoal: null,
        dailyWordResetHour: 12,
        dailyWordCounts: [{ date: "2024-01-15", count: 500 }],
        timezone: "America/New_York",
      });
    });
  });

  // --------------------------------------------------------------------------
  // resetWritingStats
  // --------------------------------------------------------------------------

  describe("resetWritingStats", () => {
    it("should create row if missing then reset stats", async () => {
      mockDb._selectChain.limit
        .mockResolvedValueOnce([]) // ensureSettingsExist: no row
        .mockResolvedValueOnce([mockDefaultRow]); // ensureSettingsExist: after insert

      await resetWritingStats(testUserId);

      // Verify insert used onConflictDoNothing (race-safe row creation)
      expect(mockDb._insertChain.onConflictDoNothing).toHaveBeenCalled();

      // Verify update was called to clear stats
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb._updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          dailyWordCounts: [],
          labelWordCounts: {},
        })
      );
    });

    it("should clear daily word counts and label counts", async () => {
      mockDb._selectChain.limit.mockResolvedValueOnce([mockExistingRow]);

      await resetWritingStats(testUserId);

      expect(mockDb._updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          dailyWordCounts: [],
          labelWordCounts: {},
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // ensureSettingsExist (tested via getUserSettings — race condition path)
  // --------------------------------------------------------------------------

  describe("ensureSettingsExist (race condition handling)", () => {
    it("should handle race condition via onConflictDoNothing", async () => {
      // Simulate: select finds nothing, but between insert and re-select,
      // another request already created the row (race condition).
      // onConflictDoNothing prevents duplicate-key error.
      const raceConditionRow = {
        ...mockDefaultRow,
        id: "inserted-by-other-request",
      };

      mockDb._selectChain.limit
        .mockResolvedValueOnce([]) // First select: no row
        .mockResolvedValueOnce([raceConditionRow]); // Re-fetch: row from concurrent request

      const result = await getUserSettings(testUserId);

      // Insert used onConflictDoNothing (race-safe)
      expect(mockDb._insertChain.onConflictDoNothing).toHaveBeenCalled();

      // Result is from the re-fetched row (could be ours or the concurrent one)
      expect(result).toEqual({
        dailyWritingGoal: null,
        dailyWordResetHour: 0,
        dailyWordCounts: [],
        timezone: "UTC",
      });
    });

    it("should throw ConflictError when re-fetch returns nothing after insert", async () => {
      // Edge case: insert succeeds but re-fetch finds nothing
      mockDb._selectChain.limit
        .mockResolvedValueOnce([]) // First select: no row
        .mockResolvedValueOnce([]); // Re-fetch: still nothing (shouldn't happen but handled)

      await expect(getUserSettings(testUserId)).rejects.toThrow(
        "Failed to create or retrieve user settings"
      );
    });
  });
});
