/**
 * GitLab Route Helpers
 *
 * Shared utilities extracted from gitlab.routes.ts to avoid duplication
 * across the GitLab route sub-plugin files.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import {
  NotFoundError,
  ForbiddenError,
} from "../middleware/error-handler.middleware.js";

/**
 * Helper to get the authenticated user ID from a request.
 * This is used for route handlers protected by the authenticate middleware,
 * which guarantees that request.user is defined.
 */
export function getAuthenticatedUserId(request: FastifyRequest): string {
  // The authenticate middleware guarantees user is set
  return request.user!.id;
}

/**
 * Handles NotFoundError (404) and ForbiddenError (403) for route catch blocks.
 * Returns true if the error was handled, false if the caller should handle it.
 */
export function handleKnownRouteErrors(
  err: unknown,
  reply: FastifyReply
): boolean {
  if (err instanceof NotFoundError) {
    reply.status(404).send({ error: "Not Found", message: err.message });
    return true;
  }
  if (err instanceof ForbiddenError) {
    reply.status(403).send({ error: "Forbidden", message: err.message });
    return true;
  }
  return false;
}
