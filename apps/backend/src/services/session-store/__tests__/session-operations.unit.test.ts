import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Session } from "fastify";
import {
  setSession,
  getSession,
  destroySession,
  cleanExpiredSessions,
} from "../session-operations.js";

// Mock the database
vi.mock("../../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../../db/schema/index.js", () => ({
  userSessions: {},
}));

vi.mock("../../drizzle-orm/index.js", () => ({
  eq: vi.fn(),
  lt: vi.fn(),
}));

// We need to mock the functions from session-store.service.js that we use
vi.mock("../../session-store.service.js", () => ({
  sessionToDbData: vi.fn(),
  dbDataToSession: vi.fn(),
}));

import { getDb } from "../../../db/index.js";
import {
  sessionToDbData,
  dbDataToSession,
} from "../../session-store.service.js";

describe("Session Operations", () => {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue(mockDb as never);
  });

  describe("setSession", () => {
    it("should skip sessions without userId", async () => {
      const mockSession = { user: {} } as Session;
      vi.mocked(sessionToDbData).mockReturnValue({ userId: "", data: {} });

      await setSession("session-123", mockSession);

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("should insert a new session", async () => {
      const mockSession = {
        user: { id: "user-123" },
        cookie: { maxAge: 3600000 },
      } as Session;
      vi.mocked(sessionToDbData).mockReturnValue({
        userId: "user-123",
        data: { csrfToken: "token" },
      });

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsert as never);

      await setSession("session-123", mockSession);

      expect(sessionToDbData).toHaveBeenCalledWith(mockSession);
      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object));
      expect(mockInsert.values).toHaveBeenCalledWith({
        id: "session-123",
        userId: "user-123",
        data: { csrfToken: "token" },
        expiresAt: expect.any(Date),
      });
    });

    it("should handle onConflictDoUpdate for existing sessions", async () => {
      const mockSession = {
        user: { id: "user-123" },
        cookie: { maxAge: 3600000 },
      } as Session;
      vi.mocked(sessionToDbData).mockReturnValue({
        userId: "user-123",
        data: { csrfToken: "token" },
      });

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsert as never);

      await setSession("session-123", mockSession);

      expect(mockInsert.onConflictDoUpdate).toHaveBeenCalled();
      const onConflictArgs = mockInsert.onConflictDoUpdate.mock.calls[0][0];
      expect(onConflictArgs.set).toMatchObject({
        userId: "user-123",
        data: { csrfToken: "token" },
      });
      expect(onConflictArgs.set.expiresAt).toBeInstanceOf(Date);
      expect(onConflictArgs.set.updatedAt).toBeInstanceOf(Date);
    });

    it("should use default 24h maxAge when cookie maxAge is not set", async () => {
      const mockSession = {
        user: { id: "user-123" },
      } as Session;
      vi.mocked(sessionToDbData).mockReturnValue({
        userId: "user-123",
        data: {},
      });

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsert as never);

      await setSession("session-123", mockSession);

      const valuesCall = mockInsert.values.mock.calls[0][0];
      const expiresAt = valuesCall.expiresAt;
      const now = Date.now();
      const diff = expiresAt.getTime() - now;
      expect(diff).toBeGreaterThan(86300000);
      expect(diff).toBeLessThan(86500000);
    });

    it("should recompute expiresAt from a real Cookie instance (sliding expiry)", async () => {
      // Faithfully reproduces @fastify/session's Cookie class: maxAge is a
      // getter that returns `expires - Date.now()` (time remaining), not the
      // configured lifetime. After touch() updates `expires` to
      // `now + originalMaxAge`, the getter should return that new lifetime
      // and the DB expiresAt should reflect the slid value.
      const ONE_HOUR = 3600000;
      const createdAt = Date.now() - 23 * 60 * 60 * 1000;
      const originalExpires = new Date(createdAt + ONE_HOUR);
      const cookie = {
        originalMaxAge: ONE_HOUR,
        _expires: originalExpires,
        get expires() {
          return this._expires;
        },
        set expires(d: Date) {
          this._expires = d;
        },
        get maxAge() {
          return this._expires instanceof Date
            ? this._expires.valueOf() - Date.now()
            : null;
        },
      };

      const mockSession = {
        user: { id: "user-123" },
        cookie,
      } as unknown as Session;
      vi.mocked(sessionToDbData).mockReturnValue({
        userId: "user-123",
        data: {},
      });

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsert as never);

      // Simulate what session-store-factory does: call touch() before setSession.
      // touch() updates cookie.expires = now + originalMaxAge.
      (mockSession as unknown as { touch: () => void }).touch = function () {
        if (cookie.originalMaxAge) {
          cookie.expires = new Date(Date.now() + cookie.originalMaxAge);
        }
      };
      (mockSession as unknown as { touch: () => void }).touch();

      await setSession("session-123", mockSession);

      const valuesCall = mockInsert.values.mock.calls[0][0];
      const expiresAt: Date = valuesCall.expiresAt;
      const now = Date.now();
      const diff = expiresAt.getTime() - now;
      // After touch(), expiresAt should be ~1h from now (not the original
      // creation+1h which would be ~1h in the past).
      expect(diff).toBeGreaterThan(ONE_HOUR - 5000);
      expect(diff).toBeLessThan(ONE_HOUR + 5000);
    });

    it("should produce stale expiresAt when touch() is not called", async () => {
      // Documents the pre-fix bug: without touch(), Cookie.maxAge is a getter
      // returning time-remaining, so Date.now() + maxAge reproduces the
      // original expiry (un-slid). This test pins the buggy behavior so the
      // regression is visible if the fix in session-store-factory is removed.
      const ONE_HOUR = 3600000;
      const createdAt = Date.now() - 23 * 60 * 60 * 1000;
      const originalExpires = new Date(createdAt + ONE_HOUR);
      const cookie = {
        originalMaxAge: ONE_HOUR,
        _expires: originalExpires,
        get expires() {
          return this._expires;
        },
        set expires(d: Date) {
          this._expires = d;
        },
        get maxAge() {
          return this._expires instanceof Date
            ? this._expires.valueOf() - Date.now()
            : null;
        },
      };

      const mockSession = {
        user: { id: "user-123" },
        cookie,
      } as unknown as Session;
      vi.mocked(sessionToDbData).mockReturnValue({
        userId: "user-123",
        data: {},
      });

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsert as never);

      // No touch() call.
      await setSession("session-123", mockSession);

      const valuesCall = mockInsert.values.mock.calls[0][0];
      const expiresAt: Date = valuesCall.expiresAt;
      // expiresAt should equal the original expiry (unchanged).
      expect(expiresAt.getTime()).toBe(originalExpires.getTime());
    });
  });

  describe("getSession", () => {
    it("should return null for non-existent session", async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelect as never);

      const result = await getSession("session-123");

      expect(result).toBeNull();
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should return session data for existing session", async () => {
      const mockRow = {
        id: "session-123",
        userId: "user-123",
        data: { csrfToken: "token" },
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockRow]),
      };
      mockDb.select.mockReturnValue(mockSelect as never);

      const mockSession = { user: { id: "user-123" }, csrfToken: "token" };
      vi.mocked(dbDataToSession).mockReturnValue(mockSession as Session);

      const result = await getSession("session-123");

      expect(result).toEqual(mockSession);
      expect(dbDataToSession).toHaveBeenCalledWith(mockRow);
    });

    it("should return null for expired sessions and delete them", async () => {
      const mockRow = {
        id: "session-123",
        userId: "user-123",
        data: { csrfToken: "token" },
        expiresAt: new Date(Date.now() - 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockRow]),
      };
      mockDb.select.mockReturnValue(mockSelect as never);

      const mockDelete = {
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      };
      mockDb.delete.mockReturnValue(mockDelete as never);

      const result = await getSession("session-123");

      expect(result).toBeNull();
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe("destroySession", () => {
    it("should delete session from database", async () => {
      const mockDelete = {
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.delete.mockReturnValue(mockDelete as never);

      await destroySession("session-123");

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDelete.where).toHaveBeenCalled();
    });
  });

  describe("cleanExpiredSessions", () => {
    it("should delete expired sessions and return count", async () => {
      const mockDelete = {
        where: vi.fn().mockResolvedValue({ rowCount: 5 }),
      };
      mockDb.delete.mockReturnValue(mockDelete as never);

      const count = await cleanExpiredSessions();

      expect(count).toBe(5);
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDelete.where).toHaveBeenCalled();
    });

    it("should return 0 when no sessions are deleted", async () => {
      const mockDelete = {
        where: vi.fn().mockResolvedValue({ rowCount: 0 }),
      };
      mockDb.delete.mockReturnValue(mockDelete as never);

      const count = await cleanExpiredSessions();

      expect(count).toBe(0);
    });

    it("should return 0 when rowCount is undefined", async () => {
      const mockDelete = {
        where: vi.fn().mockResolvedValue({}),
      };
      mockDb.delete.mockReturnValue(mockDelete as never);

      const count = await cleanExpiredSessions();

      expect(count).toBe(0);
    });
  });
});
