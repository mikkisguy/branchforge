/**
 * Authentication Routes
 *
 * Routes for user registration, login, logout, and session management.
 */

import type { FastifyInstance } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { register, validateCredentials } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import type { PublicUser } from '../middleware/auth.middleware.js';

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
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Register a new user
 *
 * POST /register
 * Body: { email, password }
 */
async function registerHandler(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply
): Promise<void> {
  const { email, password } = request.body;

  try {
    const user = await register(email, password);
    reply.status(201).send(user);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid email format') {
        reply.status(400).send({ error: error.message } as ErrorResponse);
        return;
      }
      if (error.message === 'Password must be at least 8 characters') {
        reply.status(400).send({ error: error.message } as ErrorResponse);
        return;
      }
      if (error.message === 'Email already registered') {
        reply.status(400).send({ error: error.message } as ErrorResponse);
        return;
      }
      if (error.message === 'Registration is limited to a single user') {
        reply.status(400).send({ error: error.message } as ErrorResponse);
        return;
      }
    }
    throw error;
  }
}

/**
 * Login with email and password
 *
 * POST /login
 * Body: { email, password }
 */
async function loginHandler(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
): Promise<void> {
  const { email, password } = request.body;

  if (!email || !password) {
    reply.status(400).send({ error: 'Email and password are required' } as ErrorResponse);
    return;
  }

  const user = await validateCredentials(email, password);

  if (!user) {
    reply.status(401).send({ error: 'Invalid credentials' } as ErrorResponse);
    return;
  }

  // Store user in session
  request.session.user = user;

  reply.status(200).send({ user } as SuccessResponse);
}

/**
 * Logout and clear session
 *
 * POST /logout
 */
async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Clear the session user
  delete request.session.user;

  // Reset the session (clears all data)
  await request.session.regenerate();

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
  // User is attached to request by authenticate middleware
  const user = (request as any).user as PublicUser;

  reply.status(200).send({ user } as SuccessResponse);
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes
  fastify.post('/register', registerHandler);
  fastify.post('/login', loginHandler);

  // Protected routes
  fastify.post('/logout', { onRequest: authenticate }, logoutHandler);
  fastify.get('/me', { onRequest: authenticate }, getMeHandler);
}
