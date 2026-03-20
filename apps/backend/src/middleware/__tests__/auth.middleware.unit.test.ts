import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { authenticate, optionalAuth, requireRole } from "../auth.middleware.js";
import type { PublicUser } from "../auth.middleware.js";
import * as logger from "../../lib/logger.js";

describe("Auth Middleware", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    // Mock logger functions
    vi.spyOn(logger, "logSecurityEvent").mockImplementation(() => {});
    vi.spyOn(logger, "logError").mockImplementation(() => {});

    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "a".repeat(32),
    });
  });

  describe("authenticate", () => {
    it("should return 401 when no user in session", async () => {
      fastify.get(
        "/protected",
        {
          onRequest: authenticate,
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });

    it("should attach user to request when authenticated", async () => {
      const mockUser: PublicUser = {
        id: "123",
        email: "test@example.com",
        role: "OWNER",
      };

      let requestUser: PublicUser | undefined;

      fastify.get(
        "/protected",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = mockUser;
            return authenticate(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async (request: any) => {
          requestUser = (request as any).user;
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toEqual(mockUser);
    });

    it("should return 401 when session user has invalid structure", async () => {
      const invalidUser = {
        id: "123",
        // Missing email and role
      };

      fastify.get(
        "/protected",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = invalidUser;
            return authenticate(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Unauthorized",
        message: "Invalid session",
      });
    });

    it("should return 500 when session is undefined", async () => {
      fastify.get(
        "/protected",
        {
          onRequest: async (request: any, reply: any, done: any) => {
            // Temporarily remove session
            const originalSession = (request as any).session;
            delete (request as any).session;

            await authenticate(request as any, reply as any)
              .then(() => {
                // Restore session
                (request as any).session = originalSession;
                done();
              })
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Internal Server Error",
        message: "Unable to verify authentication",
      });
      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_SESSION_INVALID,
        {
          context: "authenticate",
          reason: "Session object is undefined",
        }
      );
    });

    it("should handle errors when accessing session properties", async () => {
      // Create a mock session that throws when accessing user
      const throwingSession = {
        get user() {
          throw new Error("Session storage read error");
        },
      };

      fastify.get(
        "/protected",
        {
          onRequest: async (request: any, reply: any, done: any) => {
            // Replace session with throwing mock
            const originalSession = (request as any).session;
            (request as any).session = throwingSession;

            await authenticate(request as any, reply as any)
              .then(() => {
                (request as any).session = originalSession;
                done();
              })
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Internal Server Error",
        message: "Unable to verify authentication",
      });
      expect(logger.logError).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_SESSION_INVALID,
        { context: "authenticate" },
        expect.any(Error)
      );
    });
  });

  describe("optionalAuth", () => {
    it("should continue without error when no user in session", async () => {
      fastify.get(
        "/optional",
        {
          onRequest: optionalAuth,
        },
        async (request: any) => {
          return { authenticated: !!(request as any).user };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/optional",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ authenticated: false });
    });

    it("should attach user when available in session", async () => {
      const mockUser: PublicUser = {
        id: "123",
        email: "test@example.com",
        role: "OWNER",
      };

      let requestUser: PublicUser | undefined;

      fastify.get(
        "/optional",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = mockUser;
            return optionalAuth(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async (request: any) => {
          requestUser = (request as any).user;
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/optional",
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toEqual(mockUser);
    });

    it("should not attach user with invalid structure", async () => {
      const invalidUser = {
        id: "123",
        // Missing email and role
      };

      let requestUser: PublicUser | undefined;

      fastify.get(
        "/optional",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = invalidUser;
            return optionalAuth(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async (request: any) => {
          requestUser = (request as any).user;
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/optional",
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toBeUndefined();
    });

    it("should continue without error when session is undefined", async () => {
      fastify.get(
        "/optional",
        {
          onRequest: async (request: any, reply: any, done: any) => {
            const originalSession = (request as any).session;
            delete (request as any).session;

            await optionalAuth(request as any, reply as any)
              .then(() => {
                (request as any).session = originalSession;
                done();
              })
              .catch(done);
          },
        },
        async () => {
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/optional",
      });

      // optionalAuth handles undefined session gracefully - no error thrown, just returns early
      expect(response.statusCode).toBe(200);
      // No error logging for undefined session - early return is expected behavior
    });

    it("should handle errors gracefully and continue", async () => {
      // Create a mock session that throws when accessing user
      const throwingSession = {
        get user() {
          throw new Error("Session error");
        },
      };

      fastify.get(
        "/optional",
        {
          onRequest: async (request: any, reply: any, done: any) => {
            const originalSession = (request as any).session;
            (request as any).session = throwingSession;

            await optionalAuth(request as any, reply as any)
              .then(() => {
                (request as any).session = originalSession;
                done();
              })
              .catch(done);
          },
        },
        async () => {
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/optional",
      });

      // Should continue without error (optionalAuth never blocks)
      expect(response.statusCode).toBe(200);
      expect(logger.logError).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_SESSION_INVALID,
        { context: "optionalAuth" },
        expect.any(Error)
      );
    });
  });

  describe("requireRole", () => {
    const ownerAuth = requireRole("OWNER");

    it("should return 401 when no user in session", async () => {
      fastify.get(
        "/admin",
        {
          onRequest: ownerAuth,
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when user lacks required role", async () => {
      const mockUser: PublicUser = {
        id: "123",
        email: "reader@example.com",
        role: "READER",
      };

      fastify.get(
        "/admin",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = mockUser;
            return ownerAuth(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin",
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    });

    it("should pass when user has required role", async () => {
      const mockUser: PublicUser = {
        id: "123",
        email: "owner@example.com",
        role: "OWNER",
      };

      let requestUser: PublicUser | undefined;

      fastify.get(
        "/admin",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = mockUser;
            return ownerAuth(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async (request: any) => {
          requestUser = (request as any).user;
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin",
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toEqual(mockUser);
    });

    it("should support multiple allowed roles", async () => {
      const multiRoleAuth = requireRole("OWNER", "READER");

      const readerUser: PublicUser = {
        id: "123",
        email: "reader@example.com",
        role: "READER",
      };

      fastify.get(
        "/content",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = readerUser;
            return multiRoleAuth(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async () => {
          return { ok: true };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/content",
      });

      expect(response.statusCode).toBe(200);
    });

    it("should return 401 when session user has invalid structure", async () => {
      const invalidUser = {
        id: "123",
        // Missing email and role
      };

      fastify.get(
        "/admin",
        {
          onRequest: (request: any, reply: any, done: any) => {
            (request.session as any).user = invalidUser;
            return ownerAuth(request as any, reply as any)
              .then(done)
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin",
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Unauthorized",
        message: "Invalid session",
      });
    });

    it("should return 500 when session is undefined", async () => {
      fastify.get(
        "/admin",
        {
          onRequest: async (request: any, reply: any, done: any) => {
            const originalSession = (request as any).session;
            delete (request as any).session;

            await ownerAuth(request as any, reply as any)
              .then(() => {
                (request as any).session = originalSession;
                done();
              })
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin",
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Internal Server Error",
        message: "Unable to verify authentication",
      });
      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_SESSION_INVALID,
        {
          context: "requireRole",
          reason: "Session object is undefined",
        }
      );
    });

    it("should handle errors when accessing session properties", async () => {
      const throwingSession = {
        get user() {
          throw new Error("Session storage error");
        },
      };

      fastify.get(
        "/admin",
        {
          onRequest: async (request: any, reply: any, done: any) => {
            const originalSession = (request as any).session;
            (request as any).session = throwingSession;

            await ownerAuth(request as any, reply as any)
              .then(() => {
                (request as any).session = originalSession;
                done();
              })
              .catch(done);
          },
        },
        async () => {
          return { message: "Should not reach here" };
        }
      );

      const response = await fastify.inject({
        method: "GET",
        url: "/admin",
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Internal Server Error",
        message: "Unable to verify authentication",
      });
      expect(logger.logError).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_SESSION_INVALID,
        { context: "requireRole" },
        expect.any(Error)
      );
    });
  });
});
