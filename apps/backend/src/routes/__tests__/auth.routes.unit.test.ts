import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { authRoutes } from '../auth.routes.js';
import * as authService from '../../services/auth.service.js';
import type { PublicUser } from '../../middleware/auth.middleware.js';

// Mock the auth service
vi.mock('../../services/auth.service.js', () => ({
  register: vi.fn(),
  validateCredentials: vi.fn(),
}));

describe('Auth Routes (Unit)', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: 'a'.repeat(32),
    });

    // Register auth routes
    await fastify.register(authRoutes);
    await fastify.ready();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /register', () => {
    const mockUser: PublicUser = {
      id: '123',
      email: 'test@example.com',
      role: 'OWNER',
    };

    it('should register a new user successfully', async () => {
      vi.mocked(authService.register).mockResolvedValue(mockUser);

      const response = await fastify.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.payload)).toEqual(mockUser);
      expect(authService.register).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should fail with invalid email format', async () => {
      vi.mocked(authService.register).mockRejectedValue(new Error('Invalid email format'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'invalid-email',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Invalid email format',
      });
    });

    it('should fail with weak password', async () => {
      vi.mocked(authService.register).mockRejectedValue(new Error('Password must be at least 8 characters'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: '123',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Password must be at least 8 characters',
      });
    });

    it('should fail if email already registered', async () => {
      vi.mocked(authService.register).mockRejectedValue(new Error('Email already registered'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Email already registered',
      });
    });

    it('should fail if registration limit reached (single user)', async () => {
      vi.mocked(authService.register).mockRejectedValue(new Error('Registration is limited to a single user'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'another@example.com',
          password: 'password456',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Registration is limited to a single user',
      });
    });
  });

  describe('POST /login', () => {
    const mockUser: PublicUser = {
      id: '123',
      email: 'test@example.com',
      role: 'OWNER',
    };

    it('should login successfully with valid credentials', async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser);

      const response = await fastify.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        user: mockUser,
      });
      expect(authService.validateCredentials).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should fail with invalid email', async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Invalid credentials',
      });
    });

    it('should fail with invalid password', async () => {
      vi.mocked(authService.validateCredentials).mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Invalid credentials',
      });
    });

    it('should fail with missing email', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/login',
        payload: {
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /logout', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/logout',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /me', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/me',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });
  });
});
