import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createCleanupManager,
  startCleanup,
  stopCleanup,
  destroyCleanupManager,
} from "../cleanup-manager.js";

// Mock logger
vi.mock("../../../lib/logger.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  LogEventType: {
    SESSION_STORE_CLEANUP: "session_store_cleanup",
  },
}));

describe("Cleanup Manager", () => {
  let mockCleanupFn: ReturnType<typeof vi.fn>;
  let mockOnCleanup: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanupFn = vi.fn().mockResolvedValue(5);
    mockOnCleanup = vi.fn();
  });

  describe("createCleanupManager", () => {
    it("should create a manager with null interval", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      expect(manager.interval).toBeNull();
      expect(manager.intervalMs).toBe(60000);
      expect(manager.cleanupFn).toBe(mockCleanupFn);
      expect(manager.onCleanup).toBe(mockOnCleanup);
    });

    it("should create a manager without onCleanup callback", () => {
      const manager = createCleanupManager(60000, mockCleanupFn);

      expect(manager.onCleanup).toBeUndefined();
    });
  });

  describe("startCleanup", () => {
    it("should start the cleanup interval", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      startCleanup(manager);

      expect(manager.interval).not.toBeNull();
      stopCleanup(manager);
    });

    it("should not create duplicate intervals", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      startCleanup(manager);
      const firstInterval = manager.interval;
      startCleanup(manager);

      expect(manager.interval).toBe(firstInterval);
      stopCleanup(manager);
    });

    it("should call unref on the initial timer", () => {
      const originalSetTimeout = global.setTimeout;
      const unrefSpy = vi.fn();

      global.setTimeout = vi.fn().mockReturnValue({ unref: unrefSpy });

      try {
        const manager = createCleanupManager(
          60000,
          mockCleanupFn,
          mockOnCleanup
        );

        startCleanup(manager);

        expect(unrefSpy).toHaveBeenCalled();
        stopCleanup(manager);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it("should call unref on the rescheduled timer", async () => {
      const originalSetTimeout = global.setTimeout;
      const unrefSpy = vi.fn();

      // Mock setTimeout to call unref and execute callbacks via setImmediate
      global.setTimeout = vi
        .fn()
        .mockImplementation((fn: () => void, _delay: number) => {
          const timerId = { unref: unrefSpy };
          // Execute callback after current call stack to trigger rescheduling
          setImmediate(fn);
          return timerId;
        });

      try {
        const manager = createCleanupManager(
          60000,
          mockCleanupFn,
          mockOnCleanup
        );

        startCleanup(manager);

        // Wait for setImmediate callbacks to fire and create both timers
        await new Promise((resolve) => setImmediate(resolve));

        // unref should be called twice: once for initial timer, once for rescheduled
        expect(unrefSpy).toHaveBeenCalledTimes(2);
        stopCleanup(manager);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });
  });

  describe("stopCleanup", () => {
    it("should clear the cleanup interval", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      startCleanup(manager);
      stopCleanup(manager);

      expect(manager.interval).toBeNull();
    });

    it("should be safe to call multiple times", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      startCleanup(manager);
      stopCleanup(manager);
      stopCleanup(manager);

      expect(manager.interval).toBeNull();
    });

    it("should not throw when called on manager with null interval", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      expect(() => stopCleanup(manager)).not.toThrow();
    });
  });

  describe("destroyCleanupManager", () => {
    it("should stop cleanup and reset interval to null", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      startCleanup(manager);
      destroyCleanupManager(manager);

      expect(manager.interval).toBeNull();
    });

    it("should work on manager that was never started", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      expect(() => destroyCleanupManager(manager)).not.toThrow();
      expect(manager.interval).toBeNull();
    });
  });
});
