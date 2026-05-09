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

    it("should unref the interval if available", () => {
      const manager = createCleanupManager(60000, mockCleanupFn, mockOnCleanup);

      startCleanup(manager);

      expect(manager.interval).not.toBeNull();
      expect(typeof manager.interval?.unref).toBe("function");

      stopCleanup(manager);
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
