/**
 * Authentication Middleware
 *
 * Fastify onRequest hook for protecting routes that require authentication.
 * Extends the Fastify request type to include user information from the session.
 * Includes robust error handling for session storage issues and unexpected errors.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { PublicUser, UserRole } from "@branchforge/shared";

export type { PublicUser };

/**
 * Extend the Fastify Session type to include user data
 */
declare module "fastify" {
  interface Session {
    user?: PublicUser;
  }

  interface FastifyRequest {
    user?: PublicUser;
  }
}

/**
 * Authentication error response
 */
interface AuthError {
  error: string;
  message: string;
}

/**
 * Internal server error response (for unexpected errors)
 */
interface InternalError {
  error: string;
  message: string;
}

/**
 * Log authentication errors for debugging
 * In production, consider using a structured logging service
 */
function logAuthError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`Auth error [${context}]:`, error.message);
    // Don't log stack traces in production to avoid leaking implementation details
    if (process.env.NODE_ENV !== "production") {
      console.error(error.stack);
    }
  } else {
    console.error(`Auth error [${context}]:`, error);
  }
}

/**
 * onRequest hook to verify user is authenticated
 *
 * Checks if a user object exists in the session. If not, returns 401 Unauthorized.
 * If authenticated, attaches the user to the request context for easy access.
 *
 * Handles unexpected errors gracefully:
 * - Session storage issues (e.g., Redis connection failure)
 * - Session corruption
 * - Type errors in session data
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const session = request.session;

    // Check if session exists
    if (!session) {
      logAuthError("authenticate", "Session object is undefined");
      const error: InternalError = {
        error: "Internal Server Error",
        message: "Unable to verify authentication",
      };
      reply.status(500).send(error);
      return;
    }

    // Check if user is in session
    if (!session.user) {
      const error: AuthError = {
        error: "Unauthorized",
        message: "Authentication required",
      };
      reply.status(401).send(error);
      return;
    }

    // Validate session user data structure
    if (!session.user.id || !session.user.email || !session.user.role) {
      logAuthError("authenticate", "Invalid session user data structure");
      // Treat invalid session data as not authenticated
      const error: AuthError = {
        error: "Unauthorized",
        message: "Invalid session",
      };
      reply.status(401).send(error);
      return;
    }

    // Attach user to request for easy access in route handlers
    request.user = session.user;
  } catch (error) {
    // Handle unexpected errors (session storage issues, etc.)
    logAuthError("authenticate", error);
    const internalError: InternalError = {
      error: "Internal Server Error",
      message: "Unable to verify authentication",
    };
    reply.status(500).send(internalError);
  }
}

/**
 * Optional authentication hook
 *
 * Unlike authenticate, this does not return an error if not authenticated.
 * Useful for routes that have enhanced functionality for authenticated users
 * but also work for anonymous users.
 *
 * Handles unexpected errors gracefully - continues without authentication
 * rather than blocking the request.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const session = request.session;

    if (!session) {
      // No session available, continue without auth
      return;
    }

    if (session.user) {
      // Validate session user data structure before attaching
      if (session.user.id && session.user.email && session.user.role) {
        request.user = session.user;
      }
    }
    // If no user in session or invalid data, continue without error
  } catch (error) {
    // Log error but don't block the request
    logAuthError("optionalAuth", error);
    // Continue without authentication
  }
}

/**
 * Role-based authorization hook factory
 *
 * Creates a middleware function that checks if the authenticated user
 * has one of the specified roles.
 *
 * @param allowedRoles - Array of roles that are allowed to access the route
 *
 * Handles unexpected errors gracefully:
 * - Returns 401 if session is unavailable
 * - Returns 403 if user lacks required role
 * - Returns 500 on unexpected errors
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function roleAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const session = request.session;

      // Check if session exists
      if (!session) {
        logAuthError("requireRole", "Session object is undefined");
        const error: InternalError = {
          error: "Internal Server Error",
          message: "Unable to verify authentication",
        };
        reply.status(500).send(error);
        return;
      }

      // Check if user is authenticated
      if (!session.user) {
        const error: AuthError = {
          error: "Unauthorized",
          message: "Authentication required",
        };
        reply.status(401).send(error);
        return;
      }

      // Validate session user data structure
      if (!session.user.id || !session.user.email || !session.user.role) {
        logAuthError("requireRole", "Invalid session user data structure");
        const error: AuthError = {
          error: "Unauthorized",
          message: "Invalid session",
        };
        reply.status(401).send(error);
        return;
      }

      // Check if user has required role
      if (!allowedRoles.includes(session.user.role)) {
        const error: AuthError = {
          error: "Forbidden",
          message: "Insufficient permissions",
        };
        reply.status(403).send(error);
        return;
      }

      // Attach user to request
      request.user = session.user;
    } catch (error) {
      // Handle unexpected errors
      logAuthError("requireRole", error);
      const internalError: InternalError = {
        error: "Internal Server Error",
        message: "Unable to verify authorization",
      };
      reply.status(500).send(internalError);
    }
  };
}
