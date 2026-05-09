import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Session } from "fastify";

// Mock all dependencies before importing
vi.mock("../../session-store.service.js", () => ({
  retryWithBackoff: vi.fn(),
}));

vi.mock("../session-operations.js", () => ({
  setSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  destroySession: vi.fn().mockResolvedValue(undefined),
  cleanExpiredSessions: vi.fn().mockResolvedValue(0),
}));

vi.mock("../dead-letter-queue.js", () => ({
  createDeadLetterQueue: vi.fn(() => []),
  addToDeadLetterQueue: vi.fn((queue, entry) => [...queue, entry]),
  getDeadLetterQueue: vi.fn((queue) => queue),
  getDeadLetterQueueSize: vi.fn((queue) => queue.length),
  clearDeadLetterQueue: vi.fn(() => []),
}));

vi.mock("../cleanup-manager.js", () => ({
  createCleanupManager: vi.fn(() => ({
    interval: null,
    intervalMs: 60000,
    cleanupFn: vi.fn(),
  })),
  startCleanup: vi.fn(),
  destroyCleanupManager: vi.fn(),
}));

vi.mock("../../../lib/logger.js", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  LogEventType: {
    SESSION_STORE_ERROR: "session_store_error",
  },
}));

import {
  createSessionStore,
  type SessionStore,
} from "../session-store-factory.js";
import { retryWithBackoff } from "../../session-store.service.js";
import {
  addToDeadLetterQueue,
  getDeadLetterQueue,
  getDeadLetterQueueSize,
  clearDeadLetterQueue,
} from "../dead-letter-queue.js";
import {
  startCleanup,
  createCleanupManager,
  destroyCleanupManager,
} from "../cleanup-manager.js";

describe("Session Store Factory", () => {
  let store: SessionStore;
  const mockSession = {
    user: { id: "user-123" },
    csrfToken: "token-123",
  } as Session;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(retryWithBackoff).mockResolvedValue(undefined);
    store = createSessionStore();
  });

  describe("createSessionStore", () => {
    it("should create a store with all required methods", () => {
      expect(store).toHaveProperty("set");
      expect(store).toHaveProperty("get");
      expect(store).toHaveProperty("destroy");
      expect(store).toHaveProperty("cleanup");
      expect(store).toHaveProperty("getDeadLetterQueue");
      expect(store).toHaveProperty("getDeadLetterQueueSize");
      expect(store).toHaveProperty("clearDeadLetterQueue");
    });

    it("should start cleanup interval", () => {
      expect(startCleanup).toHaveBeenCalled();
    });

    it("should use default cleanupInterval of 1 hour", () => {
      createSessionStore();
      expect(createCleanupManager).toHaveBeenCalledWith(
        3600000,
        expect.any(Function)
      );
    });

    it("should use custom cleanupInterval", () => {
      createSessionStore({ cleanupInterval: 30000 });
      expect(createCleanupManager).toHaveBeenCalledWith(
        30000,
        expect.any(Function)
      );
    });

    it("should use custom retryOptions", () => {
      vi.mocked(retryWithBackoff).mockResolvedValue(undefined);
      const customStore = createSessionStore({
        retryOptions: { maxRetries: 5 },
      });

      customStore.set("session-123", mockSession, () => {});

      expect(retryWithBackoff).toHaveBeenCalledWith(expect.any(Function), {
        maxRetries: 5,
        baseDelayMs: 100,
        maxDelayMs: 2000,
      });
    });
  });

  describe("set", () => {
    it("should call callback immediately", () => {
      const callback = vi.fn();

      vi.mocked(retryWithBackoff).mockImplementation(
        (fn) => new Promise((resolve) => setTimeout(() => resolve(fn()), 100))
      );

      store.set("session-123", mockSession, callback);

      expect(callback).toHaveBeenCalled();
    });

    it("should call setSession with retry", () => {
      const callback = vi.fn();
      vi.mocked(retryWithBackoff).mockResolvedValue(undefined);

      store.set("session-123", mockSession, callback);

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it("should add to dead letter queue on failure", () => {
      const callback = vi.fn();
      const error = new Error("DB error");
      vi.mocked(retryWithBackoff).mockRejectedValue(error);

      store.set("session-123", mockSession, callback);

      // Wait for the promise to resolve
      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(addToDeadLetterQueue).toHaveBeenCalled();
        const args = addToDeadLetterQueue.mock.calls[0];
        expect(args[1]).toMatchObject({
          sessionId: "session-123",
          operation: "set",
          lastError: "DB error",
        });
        expect(args[2]).toBe(1000);
        expect(args[3]).toBeUndefined();
      });
    });

    it("should call onDeadLetterEntry callback on failure", () => {
      const callback = vi.fn();
      const alertCallback = vi.fn();
      const error = new Error("DB error");
      vi.mocked(retryWithBackoff).mockRejectedValue(error);

      const storeWithAlert = createSessionStore({
        onDeadLetterEntry: alertCallback,
      });

      storeWithAlert.set("session-123", mockSession, callback);

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(addToDeadLetterQueue).toHaveBeenCalledWith(
          expect.any(Array),
          expect.any(Object),
          1000,
          alertCallback
        );
      });
    });
  });

  describe("get", () => {
    it("should call getSession and pass result to callback", () => {
      const callback = vi.fn();
      const sessionData = { user: { id: "user-123" } };
      vi.mocked(retryWithBackoff).mockResolvedValue(sessionData as Session);

      store.get("session-123", callback);

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(callback).toHaveBeenCalledWith(null, sessionData);
      });
    });

    it("should pass null to callback on error", () => {
      const callback = vi.fn();
      const error = new Error("DB error");
      vi.mocked(retryWithBackoff).mockRejectedValue(error);

      store.get("session-123", callback);

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(callback).toHaveBeenCalledWith(null, null);
      });
    });
  });

  describe("destroy", () => {
    it("should call callback immediately", () => {
      const callback = vi.fn();
      vi.mocked(retryWithBackoff).mockResolvedValue(undefined);

      store.destroy("session-123", callback);

      expect(callback).toHaveBeenCalled();
    });

    it("should call destroySession with retry", () => {
      const callback = vi.fn();
      vi.mocked(retryWithBackoff).mockResolvedValue(undefined);

      store.destroy("session-123", callback);

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it("should add to dead letter queue on failure", () => {
      const callback = vi.fn();
      const error = new Error("DB error");
      vi.mocked(retryWithBackoff).mockRejectedValue(error);

      store.destroy("session-123", callback);

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(addToDeadLetterQueue).toHaveBeenCalled();
        const args = addToDeadLetterQueue.mock.calls[0];
        expect(args[1]).toMatchObject({
          sessionId: "session-123",
          operation: "destroy",
          lastError: "DB error",
        });
      });
    });
  });

  describe("cleanup", () => {
    it("should destroy cleanup manager", () => {
      store.cleanup();

      expect(destroyCleanupManager).toHaveBeenCalled();
    });

    it("should clear dead letter queue", () => {
      store.cleanup();

      expect(clearDeadLetterQueue).toHaveBeenCalled();
    });
  });

  describe("getDeadLetterQueue", () => {
    it("should return dead letter queue entries", () => {
      store.getDeadLetterQueue();

      expect(getDeadLetterQueue).toHaveBeenCalled();
    });
  });

  describe("getDeadLetterQueueSize", () => {
    it("should return dead letter queue size", () => {
      const size = store.getDeadLetterQueueSize();

      expect(getDeadLetterQueueSize).toHaveBeenCalled();
      expect(typeof size).toBe("number");
    });
  });

  describe("clearDeadLetterQueue", () => {
    it("should clear dead letter queue", () => {
      store.clearDeadLetterQueue();

      expect(clearDeadLetterQueue).toHaveBeenCalled();
    });
  });
});
