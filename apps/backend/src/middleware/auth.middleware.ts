/**
 * Authentication Middleware
 *
 * Fastify onRequest hook for protecting routes that require authentication.
 * Extends the Fastify request type to include user information from the session.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Public user information (without sensitive data)
 */
export interface PublicUser {
  id: string;
  email: string;
  role: 'OWNER' | 'READER' | 'TESTER';
}

/**
 * Extend the Fastify Session type to include user data
 */
declare module 'fastify' {
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
 * onRequest hook to verify user is authenticated
 *
 * Checks if a user object exists in the session. If not, returns 401 Unauthorized.
 * If authenticated, attaches the user to the request context for easy access.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const session = request.session;

  if (!session.user) {
    const error: AuthError = {
      error: 'Unauthorized',
      message: 'Authentication required',
    };
    reply.status(401).send(error);
    return;
  }

  // Attach user to request for easy access in route handlers
  request.user = session.user;
}

/**
 * Optional authentication hook
 *
 * Unlike authenticate, this does not return an error if not authenticated.
 * Useful for routes that have enhanced functionality for authenticated users
 * but also work for anonymous users.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const session = request.session;

  if (session.user) {
    request.user = session.user;
  }
  // If no user in session, continue without error
}

/**
 * Role-based authorization hook factory
 *
 * Creates a middleware function that checks if the authenticated user
 * has one of the specified roles.
 *
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export function requireRole(...allowedRoles: Array<'OWNER' | 'READER' | 'TESTER'>) {
  return async function roleAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const session = request.session;

    if (!session.user) {
      const error: AuthError = {
        error: 'Unauthorized',
        message: 'Authentication required',
      };
      reply.status(401).send(error);
      return;
    }

    if (!allowedRoles.includes(session.user.role)) {
      const error: AuthError = {
        error: 'Forbidden',
        message: 'Insufficient permissions',
      };
      reply.status(403).send(error);
      return;
    }

    request.user = session.user;
  };
}
