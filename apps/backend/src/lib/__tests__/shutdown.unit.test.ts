/**
 * Graceful Shutdown Unit Tests
 *
 * Tests for shutdown functionality in src/lib/shutdown.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isShutting, setShuttingState, shutdownForTest } from "../shutdown.js";

// Mock the dependencies
vi.mock("../../db/index.js", () => ({
  closeDb: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../services/rate-limiter.service.js", () => ({
  cleanupRateLimiter: vi.fn(),
}));

// We need to dynamically import after mocking
describe("Graceful Shutdown Helpers", () => {
  let mockServer: any;
  let mockSessionStore: any;
  let closeDb: any;
  let cleanupRateLimiter: any;

  beforeEach(async () => {
    // Reset shutdown state before each test
    setShuttingState(false);

    // Import mocks after they're set up
    const dbModule = await import("../../db/index.js");
    closeDb = dbModule.closeDb;

    const rateLimiterModule =
      await import("../../services/rate-limiter.service.js");
    cleanupRateLimiter = rateLimiterModule.cleanupRateLimiter;

    // Create mock server with close method
    mockServer = {
      close: vi.fn((callback?: (err?: Error) => void) => {
        // Use setImmediate to ensure callback runs on next tick but before Promise resolution
        setImmediate(() => {
          if (callback) callback();
        });
        return mockServer;
      }),
    };

    // Create mock session store with cleanup method
    mockSessionStore = {
      cleanup: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    setShuttingState(false);
  });

  describe("isShutting and setShuttingState", () => {
    it("should return false when shutdown has not started", () => {
      setShuttingState(false);
      expect(isShutting()).toBe(false);
    });

    it("should return true when shutdown is in progress", () => {
      setShuttingState(true);
      expect(isShutting()).toBe(true);
    });

    it("should allow toggling shutdown state", () => {
      expect(isShutting()).toBe(false);

      setShuttingState(true);
      expect(isShutting()).toBe(true);

      setShuttingState(false);
      expect(isShutting()).toBe(false);
    });
  });

  describe("shutdownForTest", () => {
    it("should close the server", async () => {
      await shutdownForTest(mockServer, mockSessionStore);

      expect(mockServer.close).toHaveBeenCalled();
    });

    it("should cleanup rate limiter", async () => {
      await shutdownForTest(mockServer, mockSessionStore);

      expect(cleanupRateLimiter).toHaveBeenCalled();
    });

    it("should cleanup session store", async () => {
      await shutdownForTest(mockServer, mockSessionStore);

      expect(mockSessionStore.cleanup).toHaveBeenCalled();
    });

    it("should close database connections", async () => {
      await shutdownForTest(mockServer, mockSessionStore);

      expect(closeDb).toHaveBeenCalled();
    });

    it("should reset shutdown state after completion", async () => {
      // State should be false initially (reset in beforeEach)
      expect(isShutting()).toBe(false);

      await shutdownForTest(mockServer, mockSessionStore);

      // State should be reset for test re-use after shutdown completes
      expect(isShutting()).toBe(false);
    });

    it("should execute cleanup operations in order", async () => {
      const executionOrder: string[] = [];

      mockServer.close = vi.fn((callback?: (err?: Error) => void) => {
        executionOrder.push("server-close-start");
        setTimeout(() => {
          executionOrder.push("server-close-end");
          if (callback) callback();
        }, 10);
        return mockServer;
      });

      cleanupRateLimiter.mockImplementation(() => {
        executionOrder.push("rate-limiter");
      });

      mockSessionStore.cleanup = vi.fn(() => {
        executionOrder.push("session-store");
      });

      closeDb.mockImplementation(() => {
        executionOrder.push("db-close-start");
        return Promise.resolve().then(() => {
          executionOrder.push("db-close-end");
        });
      });

      await shutdownForTest(mockServer, mockSessionStore);

      // Verify order: server close → rate limiter → session store → db close
      expect(executionOrder[0]).toBe("server-close-start");
      expect(executionOrder.indexOf("rate-limiter")).toBeGreaterThan(
        executionOrder.indexOf("server-close-end"),
      );
      expect(executionOrder.indexOf("session-store")).toBeGreaterThan(
        executionOrder.indexOf("rate-limiter"),
      );
      expect(executionOrder.indexOf("db-close-start")).toBeGreaterThan(
        executionOrder.indexOf("session-store"),
      );
    });

    it("should handle server close errors gracefully", async () => {
      const closeError = new Error("Server close error");
      mockServer.close = vi.fn((callback?: (err?: Error) => void) => {
        setTimeout(() => {
          if (callback) callback(closeError);
        }, 10);
        return mockServer;
      });

      // Should not throw even on error
      await expect(
        shutdownForTest(mockServer, mockSessionStore),
      ).resolves.toBeUndefined();

      // Should still execute other cleanup
      expect(cleanupRateLimiter).toHaveBeenCalled();
      expect(mockSessionStore.cleanup).toHaveBeenCalled();
      expect(closeDb).toHaveBeenCalled();
    });

    it("should return early if already shutting down", async () => {
      setShuttingState(true);

      await shutdownForTest(mockServer, mockSessionStore);

      // Should not execute cleanup if already shutting down
      expect(mockServer.close).not.toHaveBeenCalled();
      expect(cleanupRateLimiter).not.toHaveBeenCalled();
    });

    it("should be idempotent for multiple calls", async () => {
      // First call
      await shutdownForTest(mockServer, mockSessionStore);
      expect(mockServer.close).toHaveBeenCalledTimes(1);

      // Second call - state should already be reset by shutdownForTest
      await shutdownForTest(mockServer, mockSessionStore);
      expect(mockServer.close).toHaveBeenCalledTimes(2);
    });
  });

  describe("shutdown state management", () => {
    it("should prevent duplicate shutdown operations", async () => {
      let shutdownCount = 0;

      mockServer.close = vi.fn((callback?: (err?: Error) => void) => {
        shutdownCount++;
        setTimeout(() => {
          if (callback) callback();
        }, 10);
        return mockServer;
      });

      // Simulate concurrent shutdown attempts
      const promise1 = shutdownForTest(mockServer, mockSessionStore);
      const promise2 = shutdownForTest(mockServer, mockSessionStore);

      await Promise.all([promise1, promise2]);

      // Only one shutdown should execute
      expect(shutdownCount).toBe(1);
    });
  });
});

