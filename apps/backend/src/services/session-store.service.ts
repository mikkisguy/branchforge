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

// Re-exports from new modules
export * from "./session-store/dead-letter-queue.js";
export * from "./session-store/session-operations.js";
export * from "./session-store/cleanup-manager.js";
export * from "./session-store/session-store-factory.js";

// Backward compatibility aliases
export { createSessionStore as createDrizzleSessionStore } from "./session-store/session-store-factory.js";
export type { SessionStore as DrizzleSessionStore } from "./session-store/session-store-factory.js";

// Define allowed session data properties for validation
const ALLOWED_SESSION_KEYS = new Set([
  "user",
  "csrfToken",
  "flash",
  "returnTo",
]);

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
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_SESSION_KEYS.has(key)) {
      logWarn(LogEventType.SESSION_STORE_VALIDATION, {
        event: "session_validation_skipped",
        reason: "unknown_key",
        key: redactSensitiveKey(key),
      });
      continue;
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nestedObj = value as Record<string, unknown>;
      const sanitizedNested: Record<string, unknown> = {};
      let hasValidNested = false;

      for (const [nestedKey, nestedValue] of Object.entries(nestedObj)) {
        if (Object.keys(sanitizedNested).length >= 50) {
          logWarn(LogEventType.SESSION_STORE_VALIDATION, {
            event: "session_validation_skipped",
            reason: "too_many_nested_keys",
            key: redactSensitiveKey(key),
            maxKeys: 50,
          });
          break;
        }
        if (nestedKey.length > 100) {
          logWarn(LogEventType.SESSION_STORE_VALIDATION, {
            event: "session_validation_skipped",
            reason: "nested_key_too_long",
            key: redactSensitiveKey(key),
            nestedKey: redactSensitiveKey(nestedKey),
            maxLength: 100,
          });
          continue;
        }

        if (
          nestedValue === null ||
          typeof nestedValue === "string" ||
          typeof nestedValue === "number" ||
          typeof nestedValue === "boolean"
        ) {
          sanitizedNested[nestedKey] = nestedValue;
          hasValidNested = true;
        }
      }

      if (hasValidNested) {
        sanitized[key] = sanitizedNested;
      }
    } else if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    } else {
      logWarn(LogEventType.SESSION_STORE_VALIDATION, {
        event: "session_validation_skipped",
        reason: "invalid_value_type",
        key: redactSensitiveKey(key),
      });
    }
  }

  return sanitized;
}

interface SessionRow {
  id: string;
  userId: string;
  data: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

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
export function dbDataToSession(row: SessionRow): Session {
  const session: Partial<Session> = {
    ...row.data,
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
