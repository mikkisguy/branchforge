/**
 * Drizzle Session Store
 *
 * A custom session store implementation for @fastify/session using Drizzle ORM.
 * Provides persistent session storage in PostgreSQL with automatic cleanup of expired sessions.
 *
 * This module has been refactored from a class-based implementation to pure functions
 * for better testability and composability.
 *
 * Benefits over memory storage:
 * - Sessions survive server restarts
 * - Supports multiple server instances (horizontal scaling)
 * - Automatic cleanup of expired sessions
 * - Better security with database-level isolation
 */

import type { Session } from "fastify";
import { logWarn, LogEventType, redactSensitiveKey } from "../lib/logger.js";
import {
  sessionDataSchema,
  ALLOWED_SESSION_KEYS,
  type SessionData,
} from "../lib/validation.js";

// Re-exports from new modules
export * from "./session-store/dead-letter-queue.js";
export * from "./session-store/session-operations.js";
export * from "./session-store/cleanup-manager.js";
export * from "./session-store/session-store-factory.js";

// Backward compatibility aliases
export { createSessionStore as createDrizzleSessionStore } from "./session-store/session-store-factory.js";
export type { SessionStore as DrizzleSessionStore } from "./session-store/session-store-factory.js";

// Retry configuration for session store operations
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};

/**
 * Validate and sanitize session data before storage
 */
export function validateSessionData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const allowedKeys = new Set<string>(ALLOWED_SESSION_KEYS);
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!allowedKeys.has(key)) {
      logWarn(LogEventType.SESSION_STORE_VALIDATION, {
        event: "session_validation_skipped",
        reason: "unknown_key",
        key: redactSensitiveKey(key),
      });
      continue;
    }
    filtered[key] = value;
  }

  const result = sessionDataSchema.safeParse(filtered);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = (issue.path.length > 0 ? issue.path[0] : "unknown") as string;
      logWarn(LogEventType.SESSION_STORE_VALIDATION, {
        event: "session_validation_skipped",
        reason: issue.code,
        key: redactSensitiveKey(key),
        ...(issue.path.length > 0 && { detail: issue.message }),
      });
    }
    return {};
  }

  return result.data;
}

export type ValidatedSessionData = SessionData;

/**
 * Convert Fastify session data to database format
 */
export function sessionToDbData(session: Session): {
  userId: string;
  data: Record<string, unknown>;
} {
  const userId = (session.user as { id?: string } | undefined)?.id || "";

  const rawData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(session)) {
    if (
      key !== "expires" &&
      key !== "cookie" &&
      key !== "sessionId" &&
      key !== "encryptedSessionId"
    ) {
      rawData[key] = value;
    }
  }

  const data = validateSessionData(rawData);

  return { userId, data };
}

/**
 * Convert database row to Fastify session data
 */
export function dbDataToSession(row: {
  id: string;
  userId: string;
  data: unknown;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): Session {
  const data = row.data ?? {};
  const dataAsRecord =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : data === null
        ? {}
        : {};
  const session: Partial<Session> = {
    ...dataAsRecord,
    cookie: {
      originalMaxAge: row.expiresAt.getTime() - Date.now(),
      expires: row.expiresAt,
    },
  };
  return session as Session;
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  if (options.maxRetries < 0) {
    throw new Error("maxRetries must be >= 0");
  }
  if (options.baseDelayMs < 0) {
    throw new Error("baseDelayMs must be >= 0");
  }
  if (options.maxDelayMs < 0) {
    throw new Error("maxDelayMs must be >= 0");
  }
  if (options.maxDelayMs < options.baseDelayMs) {
    throw new Error("maxDelayMs must be >= baseDelayMs");
  }

  let lastError: Error | undefined;
  const { maxRetries, baseDelayMs, maxDelayMs } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const exponentialDelay = Math.min(
          baseDelayMs * 2 ** attempt,
          maxDelayMs
        );
        const jitter = Math.random() * 0.3 * exponentialDelay;
        const delay = exponentialDelay + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
