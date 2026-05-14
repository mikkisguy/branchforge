/**
 * Global Error Handler Middleware
 *
 * Provides custom error classes and a global error handler for Fastify.
 * All route handlers can throw these errors for consistent error responses.
 *
 * Pattern: Follows the same error handling approach as auth.middleware.ts
 * - Generic error messages to prevent information leakage
 * - Detailed logging for debugging
 * - Consistent error response format
 */

import type { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { UPLOAD_MAX_SIZE_MB } from "@branchforge/shared";
import { logError, LogEventType } from "../lib/logger.js";

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base HTTP Error class
 * All custom errors extend this class for consistent handling
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public userMessage: string = message
  ) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Validation Error (400 Bad Request)
 * Use when input validation fails (e.g., from Zod schemas)
 */
export class ValidationError extends HttpError {
  constructor(
    message: string = "Validation failed",
    public details?: unknown
  ) {
    super(400, message, "Invalid request data");
    this.name = "ValidationError";
  }
}

/**
 * Not Found Error (404 Not Found)
 * Use when a requested resource doesn't exist
 */
export class NotFoundError extends HttpError {
  constructor(resource: string = "Resource") {
    super(404, `${resource} not found`, `${resource} not found`);
    this.name = "NotFoundError";
  }
}

/**
 * Forbidden Error (403 Forbidden)
 * Use when user lacks permission to access a resource
 */
export class ForbiddenError extends HttpError {
  constructor(message: string = "Access denied") {
    super(403, message, "Insufficient permissions");
    this.name = "ForbiddenError";
  }
}

/**
 * Unauthorized Error (401 Unauthorized)
 * Use when authentication is required but missing or invalid
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string = "Authentication required") {
    super(401, message, "Authentication required");
    this.name = "UnauthorizedError";
  }
}

/**
 * Conflict Error (409 Conflict)
 * Use when a request conflicts with existing data
 */
export class ConflictError extends HttpError {
  constructor(message: string = "Resource already exists") {
    super(409, message, "Resource conflict");
    this.name = "ConflictError";
  }
}

/**
 * Repository Not Linked Error (404 Not Found)
 * Use when a GitLab repository is not linked to a project.
 * Distinct from general NotFoundError so handlers can return
 * empty arrays instead of 404 errors for this specific case.
 */
export class RepositoryNotLinkedError extends NotFoundError {
  constructor(message: string = "GitLab repository not linked") {
    super("GitLab repository");
    this.message = message;
    this.name = "RepositoryNotLinkedError";
  }
}

/**
 * Rate Limit Error (429 Too Many Requests)
 * Use when rate limit is exceeded
 */
export class RateLimitError extends HttpError {
  constructor(
    public retryAfter?: number,
    message: string = "Too many requests"
  ) {
    super(429, message, "Too many requests, please try again later");
    this.name = "RateLimitError";
  }
}

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Validation error response format
 */
export interface ValidationErrorResponse extends ErrorResponse {
  details?: unknown;
}

/**
 * Rate limit error response format
 */
export interface RateLimitResponse extends ErrorResponse {
  retryAfter?: number;
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log HTTP error details using the structured logger
 *
 * @param context - Where the error occurred (e.g., route name, function name)
 * @param error - The error to log
 */
export function logHttpError(context: string, error: unknown): void {
  const details: Record<string, unknown> = {
    context,
  };

  if (error instanceof HttpError) {
    details.name = error.name;
    details.statusCode = error.statusCode;
    details.message = error.message;
    if (error instanceof ValidationError) {
      details.validationDetails = error.details;
    }
  } else if (error instanceof Error) {
    details.name = error.name;
    details.message = error.message;
  }

  logError(LogEventType.SERVICE_ERROR, details, error);
}

/**
 * Log authentication/authorization errors
 * Reuses the pattern from auth.middleware.ts for consistency
 *
 * @param context - Where the error occurred
 * @param error - The error to log
 */
export function logAuthError(context: string, error: unknown): void {
  logHttpError(`auth:${context}`, error);
}

// ============================================================================
// Global Error Handler
// ============================================================================

/**
 * Global error handler for Fastify
 *
 * Handles all errors thrown in route handlers and middleware:
 * - Custom HttpError subclasses are handled with their status code
 * - Zod validation errors are converted to ValidationError
 * - Unknown errors are logged and returned as 500
 *
 * @param error - The error thrown
 * @param request - The Fastify request
 * @param reply - The Fastify reply
 */
export function globalErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const route = `${request.method} ${request.url}`;

  // Handle custom HTTP errors
  if (error instanceof HttpError) {
    logHttpError(route, error);

    const response: ErrorResponse = {
      error: error.name,
      message: error.userMessage,
    };

    // Include details for validation errors
    if (
      error instanceof ValidationError &&
      (error as ValidationError).details
    ) {
      (response as ValidationErrorResponse).details = (
        error as ValidationError
      ).details;
    }

    // Include retryAfter for rate limit errors
    if (
      error instanceof RateLimitError &&
      (error as RateLimitError).retryAfter
    ) {
      const retryAfter = (error as RateLimitError).retryAfter!;
      (response as RateLimitResponse).retryAfter = retryAfter;
      reply.header("Retry-After", retryAfter.toString());
    }

    reply.status(error.statusCode).send(response);
    return;
  }

  // Handle Zod validation errors
  if (error.name === "ZodError") {
    logHttpError(route, error);

    const validationError = new ValidationError("Invalid request data", error);
    const response: ValidationErrorResponse = {
      error: "ValidationError",
      message: validationError.userMessage,
      details: error,
    };

    reply.status(400).send(response);
    return;
  }

  // Handle Fastify validation errors
  if (error.validation) {
    logHttpError(route, error);

    const response: ValidationErrorResponse = {
      error: "ValidationError",
      message: "Invalid request data",
      details: error.validation,
    };

    reply.status(400).send(response);
    return;
  }

  // Handle multipart plugin file size limit errors (from busboy)
  if (error.code === "LIMIT_FILE_SIZE") {
    logHttpError(route, error);
    const response: ErrorResponse = {
      error: "ValidationError",
      message: `File must be smaller than ${UPLOAD_MAX_SIZE_MB}MB`,
    };
    reply.status(400).send(response);
    return;
  }

  // Handle unknown errors
  logHttpError(route, error);

  const response: ErrorResponse = {
    error: "InternalServerError",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : error.message || "Unknown error",
  };

  reply.status(500).send(response);
}
