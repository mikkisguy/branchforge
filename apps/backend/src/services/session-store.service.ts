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
import { sessions } from '../db/schema/index.js';
import { eq, lt } from 'drizzle-orm';

type Callback = (err?: any) => void;
type CallbackSession = (err: any, result?: Session | null) => void;

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

  // Clean the session data before storing
  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(session)) {
    // Skip internal Fastify session properties
    if (key !== 'expires' && key !== 'cookie' && key !== 'sessionId' && key !== 'encryptedSessionId') {
      cleanData[key] = value;
    }
  }

  return { userId, data: cleanData };
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

      // Calculate expiration time from cookie maxAge or default to 24 hours
      const maxAge = session.cookie?.maxAge ?? 86400000;
      const expiresAt = new Date(Date.now() + maxAge);

      await db
        .insert(sessions)
        .values({
          id: sessionId,
          userId,
          data: cleanData as Record<string, never>, // Type assertion for Drizzle jsonb
          expiresAt,
        })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            userId,
            data: cleanData as Record<string, never>, // Type assertion for Drizzle jsonb
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
        .from(sessions)
        .where(eq(sessions.id, sessionId))
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
      await db.delete(sessions).where(eq(sessions.id, sessionId));
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

      const result = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, now))
        .returning({ id: sessions.id });

      return result.length;
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
      const count = await this.cleanExpiredSessions();
      if (count > 0) {
        console.log(`Session store: Cleaned up ${count} expired sessions`);
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
