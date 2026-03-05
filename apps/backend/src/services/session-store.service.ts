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

import type { SessionStore } from '@fastify/session';
import type { Session } from 'fastify';
import { getDb } from '../db/index.js';
import { userSessions } from '../db/schema/index.js';
import { eq, lt } from 'drizzle-orm';

type Callback = (err?: any) => void;
type CallbackSession = (err: any, result?: Session | null) => void;

// Define allowed session data properties for validation
const ALLOWED_SESSION_KEYS = new Set([
  'user',
  'csrfToken',
  'flash',
  'returnTo',
  // Add other allowed keys as needed
]);

/**
 * Validate and sanitize session data before storage
 */
function validateSessionData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Only allow whitelisted keys
    if (!ALLOWED_SESSION_KEYS.has(key)) {
      console.warn(`Session store: Skipping unknown session key "${key}"`);
      continue;
    }

    // Recursively validate nested objects (up to 2 levels deep)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedObj = value as Record<string, unknown>;
      const sanitizedNested: Record<string, unknown> = {};
      let hasValidNested = false;

      for (const [nestedKey, nestedValue] of Object.entries(nestedObj)) {
        // Limit nested object size and key length
        if (Object.keys(sanitizedNested).length >= 50) {
          console.warn(`Session store: Too many keys in nested object "${key}"`);
          break;
        }
        if (nestedKey.length > 100) {
          console.warn(`Session store: Nested key too long in "${key}.${nestedKey}"`);
          continue;
        }

        // Validate primitive values only (no nested objects beyond 2 levels)
        if (
          nestedValue === null ||
          typeof nestedValue === 'string' ||
          typeof nestedValue === 'number' ||
          typeof nestedValue === 'boolean'
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
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      // Allow primitive values
      sanitized[key] = value;
    } else {
      console.warn(`Session store: Skipping invalid value for key "${key}"`);
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
function sessionToDbData(session: Session): { userId: string; data: Record<string, unknown> } {
  // Extract userId from session data if present
  const userId = (session.user as { id?: string } | undefined)?.id || '';

  // Clean the session data before storing (remove Fastify internals)
  const rawData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(session)) {
    // Skip internal Fastify session properties
    if (key !== 'expires' && key !== 'cookie' && key !== 'sessionId' && key !== 'encryptedSessionId') {
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
 * Drizzle-based session store implementation
 * Implements the callback-based SessionStore interface from @fastify/session
 */
export class DrizzleSessionStore implements SessionStore {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly cleanupIntervalMs: number;

  constructor(options: { cleanupInterval?: number } = {}) {
    this.cleanupIntervalMs = options.cleanupInterval ?? 60 * 60 * 1000; // Default: 1 hour
    this.startCleanup();
  }

  /**
   * Set a session (callback-based API)
   */
  set(sessionId: string, session: Session, callback: Callback): void {
    // Convert to Promise-based then call the callback
    this.setAsync(sessionId, session)
      .then(() => callback())
      .catch((err) => callback(err));
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
        await new Promise(resolve => setImmediate(resolve));
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
      console.error('Session store set error:', error);
      throw error;
    }
  }

  /**
   * Get a session by ID (callback-based API)
   */
  get(sessionId: string, callback: CallbackSession): void {
    // Convert to Promise-based then call the callback
    this.getAsync(sessionId)
      .then((session) => callback(null, session))
      .catch((err) => callback(err));
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
      console.error('Session store get error:', error);
      throw error;
    }
  }

  /**
   * Destroy a session (callback-based API)
   */
  destroy(sessionId: string, callback: Callback): void {
    // Convert to Promise-based then call the callback
    this.destroyAsync(sessionId)
      .then(() => callback())
      .catch((err) => callback(err));
  }

  /**
   * Async version of destroy for internal use
   */
  private async destroyAsync(sessionId: string): Promise<void> {
    try {
      const db = getDb();
      await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    } catch (error) {
      console.error('Session store destroy error:', error);
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
      console.error('Session store cleanup error:', error);
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
        console.log(`Session store: Cleaned up ${count} expired sessions (${duration}ms)`);
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
   * Clean up resources when the store is destroyed
   */
  cleanup(): void {
    this.stopCleanup();
  }
}

/**
 * Create a new Drizzle session store instance
 */
export function createDrizzleSessionStore(options?: { cleanupInterval?: number }): DrizzleSessionStore {
  return new DrizzleSessionStore(options);
}
