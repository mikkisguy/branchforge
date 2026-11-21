import type { Session } from "fastify";
import { getDb } from "../../db/index.js";
import { userSessions } from "../../db/schema/index.js";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
  dbDataToSession,
  SESSION_METADATA_KEY,
  sessionToDbData,
} from "../session-store.service.js";
import { getSessionMaxAge } from "../../lib/config.js";

/**
 * Set a session in the database
 */
function sessionValues(session: Session) {
  const maxAge = session.cookie?.maxAge ?? getSessionMaxAge();
  return {
    ...sessionToDbData(session),
    expiresAt: new Date(Date.now() + maxAge),
  };
}

export async function setSession(
  sessionId: string,
  session: Session
): Promise<void> {
  await getDb()
    .insert(userSessions)
    .values({
      id: sessionId,
      ...sessionValues(session),
    });
}

/** Replace a live session only if the stored generation still matches. */
export async function compareAndSetSession(
  sessionId: string,
  expectedGeneration: string,
  session: Session
): Promise<boolean> {
  // Fastify treats rows written before generation metadata as generation=id.
  const generation = sql<string>`coalesce(${userSessions.data} -> ${SESSION_METADATA_KEY}::text ->> 'generation', ${userSessions.id})`;
  const result = await getDb()
    .update(userSessions)
    .set({ ...sessionValues(session), updatedAt: new Date() })
    .where(
      and(
        eq(userSessions.id, sessionId),
        eq(generation, expectedGeneration),
        gt(userSessions.expiresAt, new Date())
      )
    );

  return result.rowCount === 1;
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

  const row = result[0];
  if (!row || row.expiresAt <= new Date()) {
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
