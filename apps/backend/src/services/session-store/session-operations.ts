import type { Session } from "fastify";
import { getDb } from "../../db/index.js";
import { userSessions } from "../../db/schema/index.js";
import { eq, lt } from "drizzle-orm";
import { sessionToDbData, dbDataToSession } from "../session-store.service.js";
import { getSessionMaxAge } from "../../lib/config.js";

/**
 * Set a session in the database
 */
export async function setSession(
  sessionId: string,
  session: Session
): Promise<void> {
  const db = getDb();
  const { userId, data: cleanData } = sessionToDbData(session);

  // Async deferral ensures consistent behavior for sessions without userId
  // This matches the original session store implementation's pattern
  // and allows the caller to handle the async operation consistently
  if (!userId) {
    await new Promise((resolve) => setImmediate(resolve));
    return;
  }

  const maxAge = session.cookie?.maxAge ?? getSessionMaxAge();
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
}

/**
 * Get a session from the database by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
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

  if (row.expiresAt < new Date()) {
    await destroySession(sessionId);
    return null;
  }

  return dbDataToSession(row);
}

/**
 * Destroy a session from the database
 */
export async function destroySession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(userSessions).where(eq(userSessions.id, sessionId));
}

/**
 * Clean up expired sessions from the database
 */
export async function cleanExpiredSessions(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const result = await db
    .delete(userSessions)
    .where(lt(userSessions.expiresAt, now));

  return result.rowCount ?? 0;
}
