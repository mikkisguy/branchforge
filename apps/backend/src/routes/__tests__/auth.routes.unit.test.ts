import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { authRoutes } from "../auth.routes.js";
import * as authService from "../../services/auth.service.js";
import * as rateLimiter from "../../services/rate-limiter.service.js";
import type { PublicUser } from "../../middleware/auth.middleware.js";
import * as logger from "../../lib/logger.js";

// Mock the auth service and rate limiter
vi.mock("../../services/auth.service.js", () => ({
  register: vi.fn(),
  validateCredentials: vi.fn(),
}));

vi.mock("../../services/rate-limiter.service.js", () => ({
  checkRateLimit: vi.fn(),
  clearRateLimit: vi.fn(),
}));

beforeEach(() => {
  // Mock logger functions
  vi.spyOn(logger, "logSecurityEvent").mockImplementation(() => {});
  vi.spyOn(logger, "logInfo").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Auth Routes (Unit)", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: "a".repeat(32),
    });

    // Register auth routes
    await fastify.register(authRoutes);
    await fastify.ready();
  });

  describe("POST /register", () => {
    const mockUser: PublicUser = {
      id: "123",
      email: "test@example.com",
      role: "OWNER",
    };

    it("should register a new user successfully", async () => {
      vi.mocked(authService.register).mockResolvedValue(mockUser);

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: {
          email: "test@example.com",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.payload)).toEqual(mockUser);
      expect(authService.register).toHaveBeenCalledWith(
        "test@example.com",
        "password123"
      );
    });

    it("should return generic error for invalid email format (security)", async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new Error("Invalid email format")
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: {
          email: "invalid-email",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid registration data",
      });
      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_REGISTRATION_FAILURE,
        {
          message: "Invalid email format",
        },
        expect.any(Error)
      );
    });

    it("should return generic error for weak password (security)", async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new Error("Password must be at least 8 characters")
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: {
          email: "test@example.com",
          password: "123",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid registration data",
      });
      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_REGISTRATION_FAILURE,
        {
          message: "Password must be at least 8 characters",
        },
        expect.any(Error)
      );
    });

    it("should return generic error if email already registered (security)", async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new Error("Email already registered")
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: {
          email: "test@example.com",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid registration data",
      });
      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_REGISTRATION_FAILURE,
        {
          message: "Email already registered",
        },
        expect.any(Error)
      );
    });

    it("should return generic error if registration is disabled (security)", async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new Error("Registration is currently disabled")
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: {
          email: "another@example.com",
          password: "password456",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid registration data",
      });
      expect(logger.logSecurityEvent).toHaveBeenCalledWith(
        logger.LogEventType.AUTH_REGISTRATION_FAILURE,
        {
          message: "Registration is currently disabled",
        },
        expect.any(Error)
      );
    });
  });

  describe("POST /login", () => {
    const mockUser: PublicUser = {
      id: "123",
      email: "test@example.com",
      role: "OWNER",
    };

    beforeEach(() => {
      // Default: rate limit allows
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
        allowed: true,
        remainingAttempts: 4,
      });
    });

    it("should login successfully with valid credentials", async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser);

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: {
          email: "test@example.com",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        user: mockUser,
      });
      expect(authService.validateCredentials).toHaveBeenCalledWith(
        "test@example.com",
        "password123"
      );
      expect(rateLimiter.clearRateLimit).toHaveBeenCalled();
    });

    it("should return 429 when rate limited", async () => {
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
        allowed: false,
        remainingAttempts: 0,
        retryAfter: 900,
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: {
          email: "test@example.com",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(429);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Too many login attempts. Please try again later.",
        retryAfter: 900,
      });
      expect(authService.validateCredentials).not.toHaveBeenCalled();
    });

    it("should return generic error for missing credentials (security)", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: {
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid credentials",
      });
    });

    it("should return generic error for invalid email (security)", async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(null);

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: {
          email: "nonexistent@example.com",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid credentials",
      });
    });

    it("should return generic error for invalid password (security)", async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(null);

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: {
          email: "test@example.com",
          password: "wrongpassword",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Invalid credentials",
      });
    });

    it("should add rate limit headers on successful login", async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser);
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
        allowed: true,
        remainingAttempts: 3,
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: {
          email: "test@example.com",
          password: "password123",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-remaining"]).toBe("3");
    });
  });

  describe("POST /logout", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/logout",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /me", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/me",
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: "Unauthorized",
        message: "Authentication required",
      });
    });
  });
});
