/**
 * Graceful Shutdown Module
 *
 * Handles graceful shutdown of the server and all resources.
 * Ensures proper cleanup of:
 * - HTTP server (stop accepting new connections)
 * - Rate limiter (clear in-memory store and interval)
 * - Session store (stop cleanup interval)
 * - Database connections (close connection pool)
 *
 * Signal handlers: SIGTERM, SIGINT, uncaughtException, unhandledRejection
 */

import type { FastifyInstance } from "fastify";
import type { DrizzleSessionStore } from "../services/session-store.service.js";
import { closeDb } from "../db/index.js";
import {
  cleanupRateLimiter as cleanupRateLimiterService,
  getRateLimiterInterval,
} from "../services/rate-limiter.service.js";

/**
 * Shutdown state tracking
 */
let isShuttingDown = false;

/**
 * Check if the server is currently shutting down
 *
 * @returns true if shutdown is in progress
 */
export function isShutting(): boolean {
  return isShuttingDown;
}

/**
 * Set the shutdown state (for testing purposes)
 *
 * @param value - The new shutdown state
 */
export function setShuttingState(value: boolean): void {
  isShuttingDown = value;
}

/**
 * Perform graceful shutdown of all resources
 *
 * Shutdown sequence:
 * 1. Stop accepting new connections (server.close())
 * 2. Cleanup rate limiter (clear interval and store)
 * 3. Cleanup session store (stop cleanup interval)
 * 4. Close database connections
 * 5. Exit with configured code (defaults to 0)
 *
 * @param server - The Fastify server instance
 * @param sessionStore - The session store instance
 * @param signal - The signal that triggered shutdown (for logging)
 * @param exitCode - Process exit code on successful shutdown (defaults to 0)
 * @returns Promise that resolves when shutdown is complete
 */
export async function gracefulShutdown(
  server: FastifyInstance,
  sessionStore: DrizzleSessionStore,
  signal?: string,
  exitCode = 0,
): Promise<void> {
  if (isShuttingDown) {
    console.log("Shutdown already in progress, ignoring duplicate signal");
    return;
  }

  isShuttingDown = true;
  const signalMsg = signal ? ` (${signal})` : "";
  console.log(
    `\n${new Date().toISOString()} - Starting graceful shutdown${signalMsg}`,
  );

  const startTime = Date.now();
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds max

  try {
    // Step 1: Stop accepting new connections
    console.log("  [1/4] Stopping HTTP server...");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn("    Server close timeout, forcing shutdown");
        resolve();
      }, SHUTDOWN_TIMEOUT);

      server.close((err?: Error) => {
        clearTimeout(timeout);
        if (err) {
          // Ignore errors during shutdown (server might already be closing)
          console.warn("    Server close error:", err);
        }
        console.log("    HTTP server stopped");
        resolve();
      });
    });

    // Step 2: Cleanup rate limiter
    console.log("  [2/4] Cleaning up rate limiter...");
    cleanupRateLimiterService();
    console.log("    Rate limiter cleaned up");

    // Step 3: Cleanup session store
    console.log("  [3/4] Cleaning up session store...");
    sessionStore.cleanup();
    console.log("    Session store cleaned up");

    // Step 4: Close database connections
    console.log("  [4/4] Closing database connections...");
    await closeDb();
    console.log("    Database connections closed");

    const duration = Date.now() - startTime;
    console.log(`✓ Graceful shutdown completed in ${duration}ms`);
    process.exit(exitCode);
  } catch (error) {
    console.error("✗ Error during graceful shutdown:", error);
    process.exit(1);
  }
}

/**
 * Setup signal handlers for graceful shutdown
 *
 * Registers handlers for:
 * - SIGTERM (standard termination signal)
 * - SIGINT (Ctrl+C)
 * - uncaughtException (unhandled exceptions)
 * - unhandledRejection (unhandled promise rejections)
 *
 * @param server - The Fastify server instance
 * @param sessionStore - The session store instance
 */
export function setupShutdownHandlers(
  server: FastifyInstance,
  sessionStore: DrizzleSessionStore,
): void {
  // Handle SIGTERM (standard termination signal from Docker, systemd, etc.)
  process.on("SIGTERM", () => {
    gracefulShutdown(server, sessionStore, "SIGTERM").catch((err) => {
      console.error("Error during SIGTERM shutdown:", err);
      process.exit(1);
    });
  });

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    gracefulShutdown(server, sessionStore, "SIGINT").catch((err) => {
      console.error("Error during SIGINT shutdown:", err);
      process.exit(1);
    });
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    // Attempt graceful shutdown, but exit with error code
    gracefulShutdown(server, sessionStore, "uncaughtException", 1).catch(
      (shutdownErr) => {
        console.error("Error during uncaughtException shutdown:", shutdownErr);
        process.exit(1);
      },
    );
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Log but don't exit - some promise rejections are non-fatal
    // However, if too many occur, we should shut down
    console.warn("Continuing execution despite unhandled rejection");
  });
}

/**
 * Create a graceful shutdown function for use in tests
 *
 * This allows tests to simulate shutdown without actually exiting the process.
 *
 * @param server - The Fastify server instance
 * @param sessionStore - The session store instance
 * @returns Promise that resolves when shutdown is complete
 */
export async function shutdownForTest(
  server: FastifyInstance,
  sessionStore: DrizzleSessionStore,
): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  // Stop accepting new connections
  await new Promise<void>((resolve) => {
    server.close((err?: Error) => {
      if (err) {
        console.warn("Error closing server in test:", err.message);
      }
      resolve();
    });
  });

  // Cleanup rate limiter
  cleanupRateLimiterService();

  // Cleanup session store
  sessionStore.cleanup();

  // Close database connections
  await closeDb();

  // Reset shutdown state for test re-use
  isShuttingDown = false;
}

