import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { authenticate, optionalAuth, requireRole } from '../auth.middleware.js';
import type { PublicUser } from '../auth.middleware.js';

describe('Auth Middleware', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(session, {
      secret: 'a'.repeat(32), // Session secret must be 32+ characters
    });
  });

  describe('authenticate', () => {
    it('should return 401 when no user in session', async () => {
      fastify.get('/protected', {
        onRequest: authenticate,
      }, async () => {
        return { message: 'Should not reach here' };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should attach user to request when authenticated', async () => {
      const mockUser: PublicUser = {
        id: '123',
        email: 'test@example.com',
        role: 'OWNER',
      };

      let requestUser: PublicUser | undefined;

      fastify.get('/protected', {
        onRequest: (request, reply, done) => {
          // Mock authenticated session
          (request.session as any).user = mockUser;
          return authenticate(request, reply).then(done).catch(done);
        },
      }, async (request) => {
        requestUser = (request as any).user;
        return { ok: true };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toEqual(mockUser);
    });
  });

  describe('optionalAuth', () => {
    it('should continue without error when no user in session', async () => {
      fastify.get('/optional', {
        onRequest: optionalAuth,
      }, async (request) => {
        return { authenticated: !!(request as any).user };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/optional',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ authenticated: false });
    });

    it('should attach user when available in session', async () => {
      const mockUser: PublicUser = {
        id: '123',
        email: 'test@example.com',
        role: 'OWNER',
      };

      let requestUser: PublicUser | undefined;

      fastify.get('/optional', {
        onRequest: (request, reply, done) => {
          (request.session as any).user = mockUser;
          return optionalAuth(request, reply).then(done).catch(done);
        },
      }, async (request) => {
        requestUser = (request as any).user;
        return { ok: true };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/optional',
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toEqual(mockUser);
    });
  });

  describe('requireRole', () => {
    const ownerAuth = requireRole('OWNER');

    it('should return 401 when no user in session', async () => {
      fastify.get('/admin', {
        onRequest: ownerAuth,
      }, async () => {
        return { message: 'Should not reach here' };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when user lacks required role', async () => {
      const mockUser: PublicUser = {
        id: '123',
        email: 'reader@example.com',
        role: 'READER',
      };

      fastify.get('/admin', {
        onRequest: (request, reply, done) => {
          (request.session as any).user = mockUser;
          return ownerAuth(request, reply).then(done).catch(done);
        },
      }, async () => {
        return { message: 'Should not reach here' };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin',
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    });

    it('should pass when user has required role', async () => {
      const mockUser: PublicUser = {
        id: '123',
        email: 'owner@example.com',
        role: 'OWNER',
      };

      let requestUser: PublicUser | undefined;

      fastify.get('/admin', {
        onRequest: (request, reply, done) => {
          (request.session as any).user = mockUser;
          return ownerAuth(request, reply).then(done).catch(done);
        },
      }, async (request) => {
        requestUser = (request as any).user;
        return { ok: true };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin',
      });

      expect(response.statusCode).toBe(200);
      expect(requestUser).toEqual(mockUser);
    });

    it('should support multiple allowed roles', async () => {
      const multiRoleAuth = requireRole('OWNER', 'READER');

      const readerUser: PublicUser = {
        id: '123',
        email: 'reader@example.com',
        role: 'READER',
      };

      fastify.get('/content', {
        onRequest: (request, reply, done) => {
          (request.session as any).user = readerUser;
          return multiRoleAuth(request, reply).then(done).catch(done);
        },
      }, async () => {
        return { ok: true };
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/content',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
