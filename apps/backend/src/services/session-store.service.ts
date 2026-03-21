/**
 * Drizzle Session Store
 *
 * A custom session store implementation for @fastify/session using Drizzle ORM.
 * Provides persistent session storage in PostgreSQL with automatic cleanup of expired sessions.
 *
 * Benefits over memory storage:
 * - Sessions survive server restarts
 * - Supports multiple server instances (horizontal scaling)
 * - Automatic cleanup of expired sessions
 * - Better security with database-level isolation
 */

import type { SessionStore } from "@fastify/session";
import type { Session } from "fastify";
import { getDb } from "../db/index.js";
import { userSessions } from "../db/schema/index.js";
import { eq, lt } from "drizzle-orm";
import {
  logError,
  logWarn,
  logInfo,
  LogEventType,
  redactSensitiveKey,
} from "../lib/logger.js";

type Callback = (err?: Error | null) => void;
type CallbackSession = (err: Error | null, result?: Session | null) => void;

// Define allowed session data properties for validation
const ALLOWED_SESSION_KEYS = new Set([
  "user",
  "csrfToken",
  "flash",
  "returnTo",
  // Add other allowed keys as needed
]);

// Retry configuration for session store operations
interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};

// Alert callback for dead letter events
export type DeadLetterAlertCallback = (entry: DeadLetterEntry) => void;

// Dead-letter queue for failed session operations
interface DeadLetterEntry {
  sessionId: string;
  operation: "set" | "destroy";
  sessionData?: Session;
  timestamp: Date;
  lastError: string;
  retryCount: number;
}

class DeadLetterQueue {
  private queue: DeadLetterEntry[] = [];
  private maxSize: number = 1000;
  private alertCallback?: DeadLetterAlertCallback;

  constructor(alertCallback?: DeadLetterAlertCallback) {
    this.alertCallback = alertCallback;
  }

  add(entry: DeadLetterEntry): void {
    this.queue.push(entry);
    if (this.queue.length > this.maxSize) {
      // Remove oldest entry
      this.queue.shift();
    }
    // Trigger alert callback if provided
    if (this.alertCallback) {
      try {
        this.alertCallback(entry);
      } catch (err) {
        // Log but don't throw - alert callback failures shouldn't disrupt session flow
        logError(
          LogEventType.SESSION_STORE_ERROR,
          {
            event: "dead_letter_alert_callback_failed",
          },
          err
        );
      }
    }
  }

  getEntries(): DeadLetterEntry[] {
    return [...this.queue];
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}

/**
 * Validate and sanitize session data before storage
 */
function validateSessionData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Only allow whitelisted keys
    if (!ALLOWED_SESSION_KEYS.has(key)) {
      logWarn(LogEventType.SESSION_STORE_VALIDATION, {
        event: "session_validation_skipped",
        reason: "unknown_key",
        key: redactSensitiveKey(key),
      });
      continue;
    }

    // Recursively validate nested objects (up to 2 levels deep)
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nestedObj = value as Record<string, unknown>;
      const sanitizedNested: Record<string, unknown> = {};
      let hasValidNested = false;

      for (const [nestedKey, nestedValue] of Object.entries(nestedObj)) {
        // Limit nested object size and key length
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

        // Validate primitive values only (no nested objects beyond 2 levels)
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
      // Allow primitive values
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
function sessionToDbData(session: Session): {
  userId: string;
  data: Record<string, unknown>;
} {
  // Extract userId from session data if present
  const userId = (session.user as { id?: string } | undefined)?.id || "";

  // Clean the session data before storing (remove Fastify internals)
  const rawData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(session)) {
    // Skip internal Fastify session properties
    if (
      key !== "expires" &&
      key !== "cookie" &&
      key !== "sessionId" &&
      key !== "encryptedSessionId"
    ) {
      rawData[key] = value;
    }
  }

  // Validate and sanitize the session data
  const data = validateSessionData(rawData);

  return { userId, data };
}

/**
 * Convert database row to Fastify session data
 */
function dbDataToSession(row: SessionRow): Session {
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
async function retryWithBackoff<T>(
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
        // Calculate exponential backoff delay with jitter
        const exponentialDelay = Math.min(
          baseDelayMs * 2 ** attempt,
          maxDelayMs
        );
        const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
        const delay = exponentialDelay + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Drizzle-based session store implementation
 * Implements the callback-based SessionStore interface from @fastify/session
 */
export class DrizzleSessionStore implements SessionStore {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly cleanupIntervalMs: number;
  private readonly retryOptions: RetryOptions;
  private readonly deadLetterQueue: DeadLetterQueue;

  constructor(
    options: {
      cleanupInterval?: number;
      retryOptions?: Partial<RetryOptions>;
      onDeadLetterEntry?: DeadLetterAlertCallback;
    } = {}
  ) {
    this.cleanupIntervalMs = options.cleanupInterval ?? 60 * 60 * 1000; // Default: 1 hour
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options.retryOptions };
    this.deadLetterQueue = new DeadLetterQueue(options.onDeadLetterEntry);
    this.startCleanup();
  }

  /**
   * Set a session (callback-based API)
   *
   * IMPORTANT: The callback is called immediately because @fastify/session
   * invokes set() from an onSend hook (after response is prepared).
   * Awaiting the DB write would cause "headers already sent" errors.
   *
   * The actual DB write with retry logic runs in the background.
   * Failures are logged and added to the dead-letter queue.
   */
  set(sessionId: string, session: Session, callback: Callback): void {
    // Call callback immediately - the response may already be sent
    callback();

    // Run DB write with retries in the background
    retryWithBackoff(
      () => this.setAsync(sessionId, session),
      this.retryOptions
    ).catch((err) => {
      // All retries exhausted - add to dead-letter queue
      this.deadLetterQueue.add({
        sessionId,
        operation: "set",
        sessionData: session,
        timestamp: new Date(),
        lastError: err.message || String(err),
        retryCount: this.retryOptions.maxRetries,
      });

      logError(
        LogEventType.SESSION_STORE_ERROR,
        {
          event: "session_set_failed",
          sessionId,
          retryCount: this.retryOptions.maxRetries,
        },
        err
      );
    });
  }

  /**
   * Async version of set for internal use
   */
  private async setAsync(sessionId: string, session: Session): Promise<void> {
    try {
      const db = getDb();
      const { userId, data: cleanData } = sessionToDbData(session);

      // Skip saving sessions without a valid userId (anonymous sessions)
      // We only persist authenticated sessions to the database
      // Use a small delay to match async behavior of real DB operations
      if (!userId) {
        await new Promise((resolve) => setImmediate(resolve));
        return;
      }

      // Calculate expiration time from cookie maxAge or default to 24 hours
      const maxAge = session.cookie?.maxAge ?? 86400000;
      const expiresAt = new Date(Date.now() + maxAge);

      await db
        .insert(userSessions)
        .values({
          id: sessionId,
          userId,
          data: cleanData,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: userSessions.id,
          set: {
            userId,
            data: cleanData,
            expiresAt,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      logWarn(LogEventType.SESSION_STORE_ERROR, {
        event: "session_set_async_error",
        sessionId,
      }); // Log warning for retriable failures - final exhaustion logged by set()
      throw error;
    }
  }

  /**
   * Get a session by ID (callback-based API)
   *
   * Note: get() is called early in the request lifecycle (onRequest hook),
   * so it completes before the response is sent. We use the async pattern
   * here to ensure the session data is available before the handler runs.
   */
  get(sessionId: string, callback: CallbackSession): void {
    // Convert to Promise-based then call the callback
    this.getAsync(sessionId)
      .then((session) => callback(null, session))
      .catch((err) => {
        logError(
          LogEventType.SESSION_STORE_ERROR,
          {
            event: "session_get_error",
            sessionId,
          },
          err
        );
        // Return null on error - session will be treated as not found
        callback(null, null);
      });
  }

  /**
   * Async version of get for internal use
   */
  private async getAsync(sessionId: string): Promise<Session | null> {
    try {
      const db = getDb();
      const result = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sessionId))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];

      // Check if session has expired
      if (row.expiresAt < new Date()) {
        // Clean up expired session
        await this.destroyAsync(sessionId);
        return null;
      }

      return dbDataToSession(row as SessionRow);
    } catch (error) {
      throw error; // Rethrow without logging - get() handles the error logging
    }
  }

  /**
   * Destroy a session (callback-based API)
   *
   * IMPORTANT: The callback is called immediately because @fastify/session
   * may invoke this after the response is prepared.
   * Awaiting the DB delete would cause "headers already sent" errors.
   *
   * The actual DB delete with retry logic runs in the background.
   * Failures are logged and added to the dead-letter queue.
   */
  destroy(sessionId: string, callback: Callback): void {
    // Call callback immediately - the response may already be sent
    callback();

    // Run DB delete with retries in the background
    retryWithBackoff(
      () => this.destroyAsync(sessionId),
      this.retryOptions
    ).catch((err) => {
      // All retries exhausted - add to dead-letter queue
      this.deadLetterQueue.add({
        sessionId,
        operation: "destroy",
        timestamp: new Date(),
        lastError: err.message || String(err),
        retryCount: this.retryOptions.maxRetries,
      });

      logError(
        LogEventType.SESSION_STORE_ERROR,
        {
          event: "session_destroy_failed",
          sessionId,
          retryCount: this.retryOptions.maxRetries,
        },
        err
      );
    });
  }

  /**
   * Async version of destroy for internal use
   */
  private async destroyAsync(sessionId: string): Promise<void> {
    try {
      const db = getDb();
      await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    } catch (error) {
      logWarn(LogEventType.SESSION_STORE_ERROR, {
        event: "session_destroy_async_error",
        sessionId,
      }); // Log warning for retriable failures - final exhaustion logged by destroy()
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   * This method is called periodically by the cleanup interval
   */
  async cleanExpiredSessions(): Promise<number> {
    try {
      const db = getDb();
      const now = new Date();

      // Use delete without returning() for better performance
      // We only need the count, not the actual deleted rows
      const result = await db
        .delete(userSessions)
        .where(lt(userSessions.expiresAt, now));

      return result.rowCount ?? 0;
    } catch (error) {
      logError(
        LogEventType.SESSION_STORE_ERROR,
        {
          event: "session_cleanup_error",
        },
        error
      );
      return 0;
    }
  }

  /**
   * Start the automatic cleanup interval
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(async () => {
      const startTime = Date.now();
      const count = await this.cleanExpiredSessions();
      const duration = Date.now() - startTime;
      if (count > 0) {
        logInfo(LogEventType.SESSION_STORE_CLEANUP, {
          sessionsCleaned: count,
          durationMs: duration,
        });
      }
    }, this.cleanupIntervalMs);

    // Unref to allow Node.js to exit if only this timer is keeping it alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the automatic cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get dead letter queue entries for monitoring
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return this.deadLetterQueue.getEntries();
  }

  /**
   * Get dead letter queue size
   */
  getDeadLetterQueueSize(): number {
    return this.deadLetterQueue.size();
  }

  /**
   * Clear dead letter queue (useful for testing or manual cleanup)
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue.clear();
  }

  /**
   * Clean up resources when the store is destroyed
   */
  cleanup(): void {
    this.stopCleanup();
    this.clearDeadLetterQueue();
  }
}

/**
 * Create a new Drizzle session store instance
 */
export function createDrizzleSessionStore(options?: {
  cleanupInterval?: number;
  retryOptions?: Partial<RetryOptions>;
  onDeadLetterEntry?: DeadLetterAlertCallback;
}): DrizzleSessionStore {
  return new DrizzleSessionStore(options);
}
