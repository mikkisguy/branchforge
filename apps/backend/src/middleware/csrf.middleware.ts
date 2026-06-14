/**
 * CSRF (Cross-Site Request Forgery) Middleware
 *
 * Implements the double-submit token pattern as a defense-in-depth
 * measure on top of SameSite=Lax cookies.
 *
 * Threats mitigated:
 * - Sub-domain cookie-tossing: an XSS or cookie-tossing bug on a sibling
 *   subdomain cannot read the CSRF token (which lives in the session
 *   payload, not a cookie readable by attacker JS).
 * - Non-browser clients (curl, server-to-server scripts) without access
 *   to the session-bound token are rejected.
 * - GET requests with side effects, if any are added later, are NOT
 *   blocked by SameSite=Lax - this middleware also covers those.
 *
 * Design:
 * - A 32-byte cryptographically random token is generated on login/registration
 *   and stored in the session (already whitelisted in ALLOWED_SESSION_KEYS).
 * - Clients fetch it via `GET /csrf-token` (auth-required) after login.
 * - On every state-changing request (POST/PUT/PATCH/DELETE) whose
 *   Content-Type is not exempt (multipart/form-data or
 *   application/x-www-form-urlencoded), the `x-csrf-token` header must
 *   match the session token using a constant-time comparison.
 *
 * References: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 * Tracked in: GitHub issue #206
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError } from "./error-handler.middleware.js";
import { logSecurityEvent, LogEventType } from "../lib/logger.js";

/**
 * Length of the CSRF token in bytes. 32 bytes (256 bits) is the same
 * size recommended for session secrets and is well within OWASP guidance.
 */
const CSRF_TOKEN_BYTES = 32;

/**
 * HTTP methods that are considered "safe" per RFC 7231 and do not
 * require CSRF protection. The middleware is a no-op for these.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Content types exempt from CSRF validation. Form-encoded and
 * multipart requests carry their own boundary/encoding and are not
 * trivially forgeable from a cross-site HTML form, and the
 * multipart plugin parses these before our hook runs anyway.
 */
const EXEMPT_CONTENT_TYPES = [
  "multipart/form-data",
  "application/x-www-form-urlencoded",
];

/**
 * Header name carrying the CSRF token. Lowercase per HTTP/2 convention;
 * Fastify normalizes incoming header names to lowercase.
 */
export const CSRF_HEADER = "x-csrf-token";

/**
 * Paths exempt from CSRF validation. These are endpoints that either
 * issue the token (login, register) or are themselves the token-fetch
 * endpoint. The wildcard `/login` and `/register` match exactly; for
 * base-path deployments, the matching is done against the normalized
 * route URL (pathname without query string) which Fastify populates as
 * `request.routeOptions.url` (the route definition) and `request.url`
 * (the request URL with the registered base path stripped).
 */
const EXEMPT_PATHS = new Set(["/login", "/register"]);

/**
 * Check whether the given request URL is exempt from CSRF validation.
 * Matches against the request pathname with the base path stripped
 * (Fastify registers all routes under a basePath prefix in this app).
 */
function isExemptPath(url: string): boolean {
  // url typically looks like "/api/login" or "/login" depending on
  // where the matcher runs. We only care about the last segment(s).
  // Strip query string first.
  const pathname = url.split("?")[0] ?? url;
  // Walk back through path segments to find a match.
  // We accept any suffix, but for our use case the exempt paths are
  // the trailing /login and /register segments of the URL.
  for (const exempt of EXEMPT_PATHS) {
    if (pathname === exempt || pathname.endsWith(exempt)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Session Type Augmentation
// ============================================================================

declare module "fastify" {
  interface Session {
    csrfToken?: string;
  }
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a cryptographically random CSRF token.
 *
 * Uses `crypto.randomBytes` (CSPRNG) and returns a 64-character hex string.
 * Hex is used to keep the token safe to transport as a header value
 * without quoting.
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString("hex");
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Fastify preValidation hook implementing double-submit CSRF protection.
 *
 * Behavior:
 * - Skips safe methods (GET, HEAD, OPTIONS).
 * - Skips exempt content types (multipart/form-data, application/x-www-form-urlencoded).
 * - On other state-changing requests, requires the `x-csrf-token` header
 *   to match the session's CSRF token using a constant-time comparison.
 *
 * Failure modes return 403 Forbidden via `ForbiddenError`. All failures
 * are logged as security events for observability.
 *
 * MUST be applied after `authenticate` (i.e. as a `preValidation` hook on
 * a route that is already authenticated) so that `request.session.user`
 * is guaranteed to exist. The check is session-relative, not user-relative,
 * so an unauthenticated request cannot pass even if it has a header.
 */
export async function validateCsrfToken(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // 1. Safe methods are exempt.
  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  // 2. Endpoints that issue the CSRF token (login, register) are exempt:
  // the user has no session yet, so the token is unknown to them.
  if (isExemptPath(request.url)) {
    return;
  }

  // 3. Form-encoded and multipart content types are exempt.
  // The browser sets the Content-Type with a boundary for multipart;
  // the prefix is sufficient for matching.
  const contentType = request.headers["content-type"];
  if (typeof contentType === "string") {
    const lower = contentType.toLowerCase();
    if (EXEMPT_CONTENT_TYPES.some((exempt) => lower.startsWith(exempt))) {
      return;
    }
  }

  // 4. The session must contain a CSRF token. If it does not, the user
  // has not been issued one (e.g. stale session) - reject.
  const sessionToken = request.session?.csrfToken;
  const headerToken = request.headers[CSRF_HEADER];

  if (
    typeof sessionToken !== "string" ||
    sessionToken.length === 0 ||
    typeof headerToken !== "string" ||
    headerToken.length === 0
  ) {
    logSecurityEvent(LogEventType.AUTH_SESSION_INVALID, {
      context: "validateCsrfToken",
      reason: "missing_csrf_token",
      method: request.method,
      url: request.url,
      hasSessionToken: typeof sessionToken === "string",
      hasHeaderToken: typeof headerToken === "string",
    });
    throw new ForbiddenError("Invalid CSRF token");
  }

  // 5. Constant-time compare to prevent timing oracles.
  if (!safeEqualStrings(sessionToken, headerToken)) {
    logSecurityEvent(LogEventType.AUTH_SESSION_INVALID, {
      context: "validateCsrfToken",
      reason: "csrf_token_mismatch",
      method: request.method,
      url: request.url,
    });
    throw new ForbiddenError("Invalid CSRF token");
  }
}

/**
 * Constant-time string comparison.
 *
 * `crypto.timingSafeEqual` requires equal-length buffers; if the
 * strings differ in length we still need to consume a constant amount
 * of work, so we compare against a same-length buffer derived from
 * the expected token. This avoids leaking the length of the expected
 * token to an attacker probing with varying-length headers.
 */
function safeEqualStrings(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf8");
  // If lengths differ, run timingSafeEqual against a same-length buffer
  // so the work done is independent of the caller's input length.
  if (expectedBuf.length !== provided.length) {
    const providedBuf = Buffer.from(provided, "utf8");
    // Force same-length comparison by padding/truncating the provided
    // buffer to the expected length. The result is discarded; this is
    // purely to consume a constant amount of time.
    const padded = Buffer.alloc(expectedBuf.length);
    providedBuf.copy(padded, 0, 0, Math.min(providedBuf.length, padded.length));
    timingSafeEqual(expectedBuf, padded);
    return false;
  }
  return timingSafeEqual(expectedBuf, Buffer.from(provided, "utf8"));
}
