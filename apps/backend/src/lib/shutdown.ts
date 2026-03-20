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
import { cleanupRateLimiter as cleanupRateLimiterService } from "../services/rate-limiter.service.js";
import { logInfo, logError, logWarn, LogEventType } from "./logger.js";

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
  exitCode = 0
): Promise<void> {
  if (isShuttingDown) {
    logWarn(LogEventType.SERVICE_SHUTDOWN_ERROR, {
      reason: "duplicate_signal",
    });
    return;
  }

  isShuttingDown = true;

  logInfo(LogEventType.SERVICE_SHUTDOWN_START, {
    signal: signal ?? null,
  });

  const startTime = Date.now();
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds max

  try {
    // Step 1: Stop accepting new connections
    logInfo(LogEventType.SERVICE_SHUTDOWN_STEP, {
      step: 1,
      total: 4,
      action: "stopping_http_server",
    });
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        logWarn(LogEventType.SERVICE_SHUTDOWN_ERROR, {
          reason: "server_close_timeout",
        });
        resolve();
      }, SHUTDOWN_TIMEOUT);

      server.close((err?: Error) => {
        clearTimeout(timeout);
        if (err) {
          // Ignore errors during shutdown (server might already be closing)
          logWarn(LogEventType.SERVICE_SHUTDOWN_ERROR, {
            reason: "server_close_error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
        resolve();
      });
    });

    // Step 2: Cleanup rate limiter
    logInfo(LogEventType.SERVICE_SHUTDOWN_STEP, {
      step: 2,
      total: 4,
      action: "cleaning_rate_limiter",
    });
    cleanupRateLimiterService();

    // Step 3: Cleanup session store
    logInfo(LogEventType.SERVICE_SHUTDOWN_STEP, {
      step: 3,
      total: 4,
      action: "cleaning_session_store",
    });
    sessionStore.cleanup();

    // Step 4: Close database connections
    logInfo(LogEventType.SERVICE_SHUTDOWN_STEP, {
      step: 4,
      total: 4,
      action: "closing_database",
    });
    await closeDb();

    const duration = Date.now() - startTime;
    logInfo(LogEventType.SERVICE_SHUTDOWN_COMPLETE, {
      durationMs: duration,
    });
    process.exit(exitCode);
  } catch (error) {
    logError(
      LogEventType.SERVICE_SHUTDOWN_ERROR,
      {
        phase: "graceful_shutdown",
      },
      error
    );
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
  sessionStore: DrizzleSessionStore
): void {
  // Handle SIGTERM (standard termination signal from Docker, systemd, etc.)
  process.on("SIGTERM", () => {
    gracefulShutdown(server, sessionStore, "SIGTERM").catch((err) => {
      logError(
        LogEventType.SERVICE_SHUTDOWN_ERROR,
        {
          signal: "SIGTERM",
        },
        err
      );
      process.exit(1);
    });
  });

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    gracefulShutdown(server, sessionStore, "SIGINT").catch((err) => {
      logError(
        LogEventType.SERVICE_SHUTDOWN_ERROR,
        {
          signal: "SIGINT",
        },
        err
      );
      process.exit(1);
    });
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (err) => {
    logError(
      LogEventType.SERVICE_SHUTDOWN_ERROR,
      {
        signal: "uncaughtException",
      },
      err
    );
    // Attempt graceful shutdown, but exit with error code
    gracefulShutdown(server, sessionStore, "uncaughtException", 1).catch(
      (shutdownErr) => {
        logError(
          LogEventType.SERVICE_SHUTDOWN_ERROR,
          {
            signal: "uncaughtException",
            phase: "shutdown",
          },
          shutdownErr
        );
        process.exit(1);
      }
    );
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, _promise) => {
    logError(
      LogEventType.SERVICE_SHUTDOWN_ERROR,
      {
        signal: "unhandledRejection",
      },
      reason
    );
    // Log but don't exit - some promise rejections are non-fatal
    // However, if too many occur, we should shut down
    logWarn(LogEventType.SERVICE_SHUTDOWN_ERROR, {
      note: "continuing_execution_despite_unhandled_rejection",
    });
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
  sessionStore: DrizzleSessionStore
): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  // Stop accepting new connections
  await new Promise<void>((resolve) => {
    server.close((err?: Error) => {
      if (err) {
        logWarn(LogEventType.SERVICE_SHUTDOWN_ERROR, {
          context: "test_shutdown",
          error: err.message,
        });
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
