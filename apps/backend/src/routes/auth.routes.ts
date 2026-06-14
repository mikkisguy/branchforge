/**
 * Authentication Routes
 *
 * Routes for user registration, login, logout, and session management.
 * Security: Uses generic error messages to prevent information leakage.
 * Rate limiting on login prevents brute-force attacks.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { register, validateCredentials } from "../services/auth.service.js";
import {
  checkRateLimit,
  clearRateLimit,
} from "../services/rate-limiter.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import type { PublicUser } from "../middleware/auth.middleware.js";
import { generateCsrfToken } from "../middleware/csrf.middleware.js";
import { logSecurityEvent, logInfo, LogEventType } from "../lib/logger.js";

// ============================================================================
// Types
// ============================================================================

interface RegisterBody {
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface SuccessResponse {
  user: PublicUser;
  /**
   * CSRF token issued at login time. The client should send this back
   * as the `x-csrf-token` header on subsequent state-changing requests.
   * For convenience, the same value is also available via
   * `GET /csrf-token` for clients that prefer lazy loading.
   *
   * MAY be absent when the endpoint doesn't create or reference a
   * session (e.g. /register does not create a session, /me may not
   * have a token yet in upgrade scenarios).
   */
  csrfToken?: string;
}

interface ErrorResponse {
  error: string;
}

interface RateLimitResponse extends ErrorResponse {
  retryAfter?: number;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle registration errors with generic messages to prevent information leakage.
 * Specific validation errors are logged but not exposed to clients.
 */
function handleRegistrationError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof Error) {
    // Log specific error for debugging (not exposed to client)
    logSecurityEvent(
      LogEventType.AUTH_REGISTRATION_FAILURE,
      {
        message: error.message,
      },
      error
    );

    // Return generic error message to prevent information leakage
    reply
      .status(400)
      .send({ error: "Invalid registration data" } as ErrorResponse);
    return true;
  }
  return false;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Register a new user
 *
 * POST /register
 * Body: { email, password }
 *
 * Note: Only allows single user registration for initial setup.
 * Generic error messages prevent information leakage about existing users.
 */
async function registerHandler(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply
): Promise<void> {
  const { email, password } = request.body;

  try {
    const user = await register(email, password);
    logInfo(LogEventType.AUTH_REGISTRATION_SUCCESS, {
      userId: user.id,
      email: user.email,
    });
    reply.status(201).send(user);
  } catch (error) {
    if (handleRegistrationError(error, reply)) {
      return;
    }
    throw error;
  }
}

/**
 * Login with email and password
 *
 * POST /login
 * Body: { email, password }
 *
 * Security features:
 * - Rate limiting to prevent brute-force attacks (5 attempts per 15 minutes per IP)
 * - Generic error message to prevent user enumeration
 * - Same error for missing credentials, invalid email, and wrong password
 * - Rate limit cleared on successful login
 */
async function loginHandler(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
): Promise<void> {
  const clientIp = request.ip;

  // Check rate limit
  const rateLimit = checkRateLimit(`login:${clientIp}`);
  if (!rateLimit.allowed) {
    reply.status(429).send({
      error: "Too many login attempts. Please try again later.",
      retryAfter: rateLimit.retryAfter,
    } as RateLimitResponse);
    return;
  }

  const { email, password } = request.body;

  if (!email || !password) {
    logSecurityEvent(LogEventType.AUTH_LOGIN_FAILURE, {
      reason: "missing_credentials",
      clientIp,
    });
    reply.status(401).send({ error: "Invalid credentials" } as ErrorResponse);
    return;
  }

  const user = await validateCredentials(email, password);

  if (!user) {
    logSecurityEvent(LogEventType.AUTH_LOGIN_FAILURE, {
      reason: "invalid_credentials",
      clientIp,
    });
    reply.status(401).send({ error: "Invalid credentials" } as ErrorResponse);
    return;
  }

  // Successful login - clear rate limit for this IP
  clearRateLimit(`login:${clientIp}`);

  // Log successful login
  logInfo(LogEventType.AUTH_LOGIN_SUCCESS, {
    userId: user.id,
    email: user.email,
    clientIp,
  });

  // Session rotation: regenerate session ID before storing user data
  // This prevents session fixation attacks where an attacker could set a known session ID
  await request.session.regenerate();

  // Store user in the new session
  request.session.user = user;

  // Mint a fresh CSRF token bound to this session. Returned in the
  // response body so the client can start using it immediately, and
  // persisted in the session so it survives across requests and is
  // available via GET /csrf-token.
  const csrfToken = generateCsrfToken();
  request.session.csrfToken = csrfToken;

  // Add rate limit headers
  reply.header("X-RateLimit-Remaining", rateLimit.remainingAttempts.toString());

  reply.status(200).send({ user, csrfToken } as SuccessResponse);
}

/**
 * Logout and clear session
 *
 * POST /logout
 * Requires authentication
 */
async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user?.id;
  // Destroy the session completely (removes from database)
  await request.session.destroy();
  logInfo(LogEventType.AUTH_LOGOUT, { userId });

  reply.status(204).send();
}

/**
 * Get current authenticated user
 *
 * GET /me
 * Requires authentication
 */
async function getMeHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;

  // Return the session's CSRF token alongside the user so the client
  // can cache it immediately. This eliminates the race condition where
  // a state-changing request (e.g. logout) fires before the eager
  // loadCsrfToken() call in the useAuth useEffect completes.
  // Defensive: mint a token if the session doesn't have one yet.
  if (
    !request.session.csrfToken ||
    typeof request.session.csrfToken !== "string"
  ) {
    request.session.csrfToken = generateCsrfToken();
  }

  reply
    .status(200)
    .send({ user, csrfToken: request.session.csrfToken } as SuccessResponse);
}

/**
 * Get the current session's CSRF token.
 *
 * GET /csrf-token
 * Requires authentication.
 *
 * The token is generated on login and persisted in the session. This
 * endpoint exists so clients can lazily fetch the token after the page
 * has loaded (e.g. when restoring a session from a cookie) without
 * having to log in again. The token is the same value issued at login
 * and is also returned in the login response body.
 */
async function getCsrfTokenHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Defensive: if for some reason the session was created without a
  // CSRF token (e.g. an upgrade scenario where a pre-CSRF session is
  // still active), mint one now.
  if (
    !request.session.csrfToken ||
    typeof request.session.csrfToken !== "string"
  ) {
    request.session.csrfToken = generateCsrfToken();
  }

  reply.status(200).send({ csrfToken: request.session.csrfToken });
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes - /register and /login do NOT require a CSRF token
  // (the user has no session yet). /register does not currently create
  // a session; the client must /login to obtain a CSRF token.
  fastify.post("/register", registerHandler);
  fastify.post("/login", loginHandler);

  // Protected routes. Logout is a state-changing request and the
  // global CSRF preValidation hook (registered in index.ts) requires
  // a valid x-csrf-token header on it.
  fastify.post("/logout", { onRequest: authenticate }, logoutHandler);
  fastify.get("/me", { onRequest: authenticate }, getMeHandler);
  // GET /csrf-token is a safe method, no CSRF check required.
  fastify.get("/csrf-token", { onRequest: authenticate }, getCsrfTokenHandler);
}
