import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  generateCsrfToken,
  validateCsrfToken,
  CSRF_HEADER,
} from "../csrf.middleware.js";
import * as logger from "../../lib/logger.js";

beforeEach(() => {
  vi.spyOn(logger, "logSecurityEvent").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Test the hook in isolation. We mount it on a Fastify instance with
 * test-only routes that let us stage `request.session` and
 * `request.headers` to specific values, then assert the response.
 *
 * This avoids coupling the unit tests to @fastify/session's internal
 * store behavior, which is already covered by integration tests.
 */
describe("CSRF Middleware", () => {
  describe("generateCsrfToken", () => {
    it("returns a 64-character hex string", () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns a unique token on each call", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i += 1) {
        tokens.add(generateCsrfToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe("validateCsrfToken (hook behavior)", () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = Fastify();
      // A fake session object that persists across fastify.inject calls
      // so the seed-then-verify flow works.
      const fakeSession: { csrfToken?: string } = {};
      fastify.addHook("onRequest", async (request) => {
        // Make `request.session` point at our shared fake object for the hook.
        (request as unknown as { session: typeof fakeSession }).session =
          fakeSession;
      });
      fastify.addHook("preValidation", validateCsrfToken);

      // Test fixture routes
      fastify.post("/unsafe", async () => ({ ok: true }));
      fastify.post("/upload", async () => ({ ok: true }));
      fastify.post("/form", async () => ({ ok: true }));
      fastify.get("/safe", async () => ({ ok: true }));
      fastify.post("/login", async () => ({ ok: true }));
      fastify.post("/register", async () => ({ ok: true }));
      // Helper that lets tests inject a session token via a header.
      // We mount the seed route as a preHandler-only route by registering
      // it with `config: { csrfExempt: true }` - but our hook checks
      // URLs. So instead, we directly mutate the shared session via a
      // route that runs BEFORE the CSRF preValidation hook by being
      // a GET (safe method, no CSRF check).
      fastify.get("/__seed", async (request) => {
        const session = (
          request as unknown as { session: { csrfToken?: string } }
        ).session;
        const token = request.headers["x-test-seed-token"];
        if (typeof token === "string") {
          session.csrfToken = token;
        }
        return { csrfToken: session.csrfToken ?? null };
      });

      await fastify.ready();
    });

    afterEach(async () => {
      await fastify.close();
    });

    it("allows safe methods (GET) without a token", async () => {
      const res = await fastify.inject({ method: "GET", url: "/safe" });
      expect(res.statusCode).toBe(200);
    });

    it("skips CSRF on /login and /register even with no session", async () => {
      const loginRes = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: { email: "x", password: "y" },
      });
      expect(loginRes.statusCode).toBe(200);

      const registerRes = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "x", password: "y" },
      });
      expect(registerRes.statusCode).toBe(200);
    });

    it("rejects POST without a session-bound token", async () => {
      const res = await fastify.inject({
        method: "POST",
        url: "/unsafe",
        payload: { foo: "bar" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects POST with mismatched token", async () => {
      // Seed a session token in our shared fake session.
      await fastify.inject({
        method: "GET",
        url: "/__seed",
        headers: { "x-test-seed-token": "the-good-token" },
      });

      const res = await fastify.inject({
        method: "POST",
        url: "/unsafe",
        payload: { foo: "bar" },
        headers: { [CSRF_HEADER]: "wrong-token" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("accepts POST with matching token", async () => {
      await fastify.inject({
        method: "GET",
        url: "/__seed",
        headers: { "x-test-seed-token": "the-good-token" },
      });

      const res = await fastify.inject({
        method: "POST",
        url: "/unsafe",
        payload: { foo: "bar" },
        headers: { [CSRF_HEADER]: "the-good-token" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("exempts multipart/form-data requests from CSRF", async () => {
      // No session token, no header token, but content-type exempts.
      const res = await fastify.inject({
        method: "POST",
        url: "/upload",
        headers: { "content-type": "multipart/form-data; boundary=----abc" },
        payload: "------abc--\r\n",
      });
      expect(res.statusCode).not.toBe(403);
    });

    it("exempts application/x-www-form-urlencoded requests from CSRF", async () => {
      const res = await fastify.inject({
        method: "POST",
        url: "/form",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: "foo=bar",
      });
      expect(res.statusCode).not.toBe(403);
    });

    it("does not crash on length-mismatched token input", async () => {
      await fastify.inject({
        method: "GET",
        url: "/__seed",
        headers: { "x-test-seed-token": "abc" },
      });

      const res = await fastify.inject({
        method: "POST",
        url: "/unsafe",
        payload: {},
        headers: { [CSRF_HEADER]: "a" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("does not crash on equal-length but mismatched token", async () => {
      await fastify.inject({
        method: "GET",
        url: "/__seed",
        headers: { "x-test-seed-token": "abc" },
      });

      const res = await fastify.inject({
        method: "POST",
        url: "/unsafe",
        payload: {},
        headers: { [CSRF_HEADER]: "xyz" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("logs a security event on mismatch", async () => {
      await fastify.inject({
        method: "GET",
        url: "/__seed",
        headers: { "x-test-seed-token": "good" },
      });

      await fastify.inject({
        method: "POST",
        url: "/unsafe",
        payload: {},
        headers: { [CSRF_HEADER]: "bad" },
      });

      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_SESSION_INVALID,
        expect.objectContaining({
          context: "validateCsrfToken",
          reason: "csrf_token_mismatch",
        })
      );
    });
  });
});
