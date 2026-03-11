/**
 * Error Handler Middleware Unit Tests
 *
 * Tests for custom error classes and error handling functions
 * in src/middleware/error-handler.middleware.ts
 */

import { describe, it, expect, vi } from "vitest";
import {
  HttpError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  RateLimitError,
  logError,
  logAuthError,
  globalErrorHandler,
} from "../error-handler.middleware.js";
import type { FastifyRequest, FastifyReply } from "fastify";

// Mock Fastify request and reply
const createMockRequest = (overrides = {}) =>
  ({
    method: "GET",
    routerPath: "/test",
    url: "/test",
    ...overrides,
  } as Partial<FastifyRequest> as FastifyRequest);

const createMockReply = () => {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
    header: vi.fn(),
  } as unknown as FastifyReply;

  // Chain status method
  (reply.status as any).mockReturnValue(reply);

  return reply;
};

describe("Custom Error Classes", () => {
  describe("HttpError", () => {
    it("should create base HTTP error with status code and message", () => {
      const error = new HttpError(500, "Server error", "Internal server error");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Server error");
      expect(error.userMessage).toBe("Internal server error");
      expect(error.name).toBe("HttpError");
    });
  });

  describe("ValidationError", () => {
    it("should create validation error with default message", () => {
      const error = new ValidationError();

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Validation failed");
      expect(error.userMessage).toBe("Invalid request data");
      expect(error.name).toBe("ValidationError");
    });

    it("should create validation error with custom message", () => {
      const error = new ValidationError("Custom validation error");

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Custom validation error");
    });

    it("should store validation details", () => {
      const details = { field: "email", issue: "invalid format" };
      const error = new ValidationError("Validation failed", details);

      expect(error.details).toEqual(details);
    });
  });

  describe("NotFoundError", () => {
    it("should create not found error with default message", () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Resource not found");
      expect(error.userMessage).toBe("Resource not found");
      expect(error.name).toBe("NotFoundError");
    });

    it("should create not found error with custom resource name", () => {
      const error = new NotFoundError("Project");

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Project not found");
      expect(error.userMessage).toBe("Project not found");
    });
  });

  describe("ForbiddenError", () => {
    it("should create forbidden error with default message", () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("Access denied");
      expect(error.userMessage).toBe("Insufficient permissions");
      expect(error.name).toBe("ForbiddenError");
    });

    it("should create forbidden error with custom message", () => {
      const error = new ForbiddenError("You do not have access");

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("You do not have access");
    });
  });

  describe("UnauthorizedError", () => {
    it("should create unauthorized error with default message", () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Authentication required");
      expect(error.userMessage).toBe("Authentication required");
      expect(error.name).toBe("UnauthorizedError");
    });

    it("should create unauthorized error with custom message", () => {
      const error = new UnauthorizedError("Please log in");

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Please log in");
    });
  });

  describe("ConflictError", () => {
    it("should create conflict error with default message", () => {
      const error = new ConflictError();

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe("Resource already exists");
      expect(error.userMessage).toBe("Resource conflict");
      expect(error.name).toBe("ConflictError");
    });
  });

  describe("RateLimitError", () => {
    it("should create rate limit error with default message", () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe("Too many requests");
      expect(error.userMessage).toBe(
        "Too many requests, please try again later"
      );
      expect(error.name).toBe("RateLimitError");
      expect(error.retryAfter).toBeUndefined();
    });

    it("should create rate limit error with retryAfter", () => {
      const error = new RateLimitError(60);

      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });
  });
});

describe("Logging Functions", () => {
  describe("logError", () => {
    it("should log HttpError with context", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const error = new NotFoundError("Project");
      logError("testContext", error);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should log standard Error with context", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const error = new Error("Standard error");
      logError("testContext", error);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should log unknown error types", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      logError("testContext", "string error");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("logAuthError", () => {
    it("should log auth errors with auth: prefix", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const error = new UnauthorizedError();
      logAuthError("login", error);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe("Global Error Handler", () => {
  it("should handle HttpError and send appropriate response", () => {
    const request = createMockRequest();
    const reply = createMockReply();
    const error = new NotFoundError("Project");

    globalErrorHandler(error as any, request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: "NotFoundError",
      message: "Project not found",
    });
  });

  it("should handle ValidationError with details", () => {
    const request = createMockRequest();
    const reply = createMockReply();
    const details = { field: "email", issue: "invalid" };
    const error = new ValidationError("Invalid data", details);

    globalErrorHandler(error as any, request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "ValidationError",
      message: "Invalid request data",
      details,
    });
  });

  it("should handle RateLimitError with retryAfter header", () => {
    const request = createMockRequest();
    const reply = createMockReply();
    const error = new RateLimitError(60);

    globalErrorHandler(error as any, request, reply);

    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.header).toHaveBeenCalledWith("Retry-After", "60");
    expect(reply.send).toHaveBeenCalledWith({
      error: "RateLimitError",
      message: "Too many requests, please try again later",
      retryAfter: 60,
    });
  });

  it("should handle Zod validation errors", () => {
    const request = createMockRequest();
    const reply = createMockReply();
    const error = {
      name: "ZodError",
      issues: [{ path: ["email"], message: "Invalid email" }],
    } as any;

    globalErrorHandler(error, request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "ValidationError",
      message: "Invalid request data",
      details: error,
    });
  });

  it("should handle Fastify validation errors", () => {
    const request = createMockRequest();
    const reply = createMockReply();
    const error = {
      validation: [{ field: "email", message: "Invalid email" }],
    } as any;

    globalErrorHandler(error, request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "ValidationError",
      message: "Invalid request data",
      details: error.validation,
    });
  });

  it("should handle unknown errors as 500", () => {
    const request = createMockRequest();
    const reply = createMockReply();
    const error = new Error("Unknown error");

    globalErrorHandler(error as any, request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: "InternalServerError",
      message: "Unknown error",
    });
  });

  it("should use generic error message in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const request = createMockRequest();
    const reply = createMockReply();
    const error = new Error("Detailed error message");

    globalErrorHandler(error as any, request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: "InternalServerError",
      message: "An unexpected error occurred",
    });

    process.env.NODE_ENV = originalEnv;
  });
});
