import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { eq, inArray } from "drizzle-orm";
import Fastify from "fastify";
import type { Session } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../../db/index.js";
import { users, userSessions } from "../../../db/schema/index.js";
import { requireRole } from "../../../middleware/auth.middleware.js";
import { authRoutes } from "../../../routes/auth.routes.js";
import { hashPassword } from "../../auth.service.js";
import { compareAndSetSession, getSession } from "../session-operations.js";
import { createSessionStore } from "../session-store-factory.js";

describe("PostgreSQL session store", () => {
  const email = `session-store-${randomUUID()}@example.com`;
  const password = "test-session-password";
  const cookieName = "session-test";
  const maxAge = 3_600_000;
  const sessionIds = new Set<string>();
  let userId: string;

  function newSessionId(): string {
    const id = randomUUID();
    sessionIds.add(id);
    return id;
  }

  beforeAll(async () => {
    const [user] = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterEach(async () => {
    if (sessionIds.size) {
      await getDb()
        .delete(userSessions)
        .where(inArray(userSessions.id, [...sessionIds]));
      sessionIds.clear();
    }
  });

  afterAll(async () => {
    await getDb().delete(users).where(eq(users.email, email));
    await closeDb();
  });

  it("persists login, rolls the configured expiry, and removes the session on logout", async () => {
    const app = Fastify();
    const store = createSessionStore();
    let protectedHandlerRan = false;
    app.addHook("onClose", () => store.cleanup());
    try {
      await app.register(cookie);
      await app.register(session, {
        secret: "integration-test-secret-at-least-32-characters",
        cookieName,
        cookie: { secure: false, maxAge, path: "/" },
        idGenerator: newSessionId,
        saveUninitialized: false,
        rolling: true,
        store,
      });
      await app.register(authRoutes, { prefix: "/auth" });
      app.get("/restricted", { onRequest: requireRole("READER") }, async () => {
        protectedHandlerRan = true;
        return { ok: true };
      });

      const anonymous = await app.inject({ method: "GET", url: "/auth/me" });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.cookies).toHaveLength(0);
      expect(
        await getDb()
          .select()
          .from(userSessions)
          .where(inArray(userSessions.id, [...sessionIds]))
      ).toHaveLength(0);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });
      expect(login.statusCode).toBe(200);
      const sessionCookie = login.cookies.find(
        ({ name }) => name === cookieName
      );
      expect(sessionCookie?.value).toBeTruthy();
      const [row] = await getDb()
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, userId));
      expect(row.data).toMatchObject({
        user: { id: userId },
        csrfToken: login.json().csrfToken,
        __fastifySessionMetadata: { generation: expect.any(String) },
      });

      // An existing expiry near the timeout must slide by the configured
      // lifetime, even though only a fraction of that lifetime remains.
      await getDb()
        .update(userSessions)
        .set({ expiresAt: new Date(Date.now() + 60_000) })
        .where(eq(userSessions.id, row.id));
      const cookies = { [cookieName]: sessionCookie!.value };
      const me = await app.inject({ method: "GET", url: "/auth/me", cookies });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ user: { id: userId } });
      const [rolled] = await getDb()
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, row.id));
      const cookieExpiry = me.cookies.find(
        ({ name }) => name === cookieName
      )?.expires;
      expect(cookieExpiry).toBeInstanceOf(Date);
      expect(
        Math.abs(rolled.expiresAt.getTime() - cookieExpiry!.getTime())
      ).toBeLessThan(1000);
      expect(rolled.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        maxAge - 5000
      );

      const denied = await app.inject({
        method: "GET",
        url: "/restricted",
        cookies,
      });
      expect(denied.statusCode).toBe(403);
      expect(protectedHandlerRan).toBe(false);

      const relogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
        cookies,
      });
      expect(relogin.statusCode).toBe(200);
      const rotatedCookie = relogin.cookies.find(
        ({ name }) => name === cookieName
      );
      expect(rotatedCookie?.value).toBeTruthy();
      expect(rotatedCookie?.value).not.toBe(sessionCookie?.value);
      expect(await getSession(row.id)).toMatchObject({
        csrfToken: relogin.json().csrfToken,
      });

      const logout = await app.inject({
        method: "POST",
        url: "/auth/logout",
        cookies: { [cookieName]: rotatedCookie!.value },
      });
      expect(logout.statusCode).toBe(204);
      expect(await getSession(row.id)).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("updates a legacy generation exactly once when it changes", async () => {
    const sessionId = newSessionId();
    await getDb()
      .insert(userSessions)
      .values({
        id: sessionId,
        userId,
        data: { user: { id: userId } },
        expiresAt: new Date(Date.now() + maxAge),
      });
    const replacement = {
      user: { id: userId },
      __fastifySessionMetadata: { generation: newSessionId() },
    } as Session;

    const results = await Promise.all([
      compareAndSetSession(sessionId, sessionId, replacement),
      compareAndSetSession(sessionId, sessionId, replacement),
    ]);
    expect(results).toContain(true);
    expect(results).toContain(false);
    expect(await getSession(sessionId)).toMatchObject(replacement);

    await getDb().delete(userSessions).where(eq(userSessions.id, sessionId));
    expect(await compareAndSetSession(sessionId, sessionId, replacement)).toBe(
      false
    );
    expect(await getSession(sessionId)).toBeNull();
  });
});
