/**
 * GitLab Routes Tests
 *
 * Integration tests for GitLab integration API routes.
 * Tests are written before implementation (TDD approach).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { gitlabRoutes } from '../gitlab.routes.js';
import * as gitlabService from '../../services/gitlab.service.js';
import * as gitlabSyncService from '../../services/gitlab-sync.service.js';

// Mock the services
vi.mock('../../services/gitlab.service.js', () => ({
  validateGitlabPAT: vi.fn(),
  storeGitlabIntegration: vi.fn(),
  deleteGitlabIntegration: vi.fn(),
  listGitlabProjects: vi.fn(),
  linkRepository: vi.fn(),
  unlinkRepository: vi.fn(),
  listBranches: vi.fn(),
  listRpyFiles: vi.fn(),
}));

vi.mock('../../services/gitlab-sync.service.js', () => ({
  exportToGitlab: vi.fn(),
  importFromGitlab: vi.fn(),
  getSyncOperation: vi.fn(),
  listSyncOperations: vi.fn(),
  detectConflicts: vi.fn(),
}));

// Mock the authenticate middleware
vi.mock('../../middleware/auth.middleware.js', () => ({
  authenticate: vi.fn(async (request: any, reply) => {
    // Simulate authenticated user
    request.session = { user: {
      id: 'user-123',
      email: 'test@example.com',
      role: 'OWNER' as const,
    }};
    request.user = request.session.user;
  }),
  requireRole: vi.fn(() => vi.fn(async (request: any, reply) => {
    request.user = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'OWNER' as const,
    };
  })),
}));

// Test fixtures
const testUserId = 'user-123';
const testUserEmail = 'test@example.com';
const testProjectId = 'project-123';
const testGitlabProjectId = 12345;
const testBranch = 'main';
const testOperationId = 'operation-123';

describe('GitLab Routes', () => {
  let fastify: Fastify.FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();

    // Register cookie plugin
    await fastify.register(cookie);

    // Register session plugin
    await fastify.register(session, {
      secret: 'a'.repeat(32),
      cookie: { secure: false },
    });

    // Register GitLab routes
    await fastify.register(gitlabRoutes, { prefix: '/api' });
    await fastify.ready();

    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(async () => {
    await fastify.close();
    nock.cleanAll();
    nock.enableNetConnect();
    vi.clearAllMocks();
  });

  describe('POST /api/gitlab/validate', () => {
    it('should validate a GitLab PAT', async () => {
      vi.spyOn(gitlabService, 'validateGitlabPAT').mockResolvedValue('testuser');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/validate',
        payload: {
          token: 'glpat-test123',
          gitlabUrl: 'https://gitlab.test',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        valid: true,
        username: 'testuser',
      });
    });

    it('should return 400 if token is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/validate',
        payload: {
          gitlabUrl: 'https://gitlab.test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 if token is invalid', async () => {
      vi.spyOn(gitlabService, 'validateGitlabPAT').mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/validate',
        payload: {
          token: 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'Invalid GitLab token',
      });
    });
  });

  describe('POST /api/gitlab/integration', () => {
    it('should store GitLab integration', async () => {
      vi.spyOn(gitlabService, 'validateGitlabPAT').mockResolvedValue('testuser');
      vi.spyOn(gitlabService, 'storeGitlabIntegration').mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/integration',
        payload: {
          token: 'glpat-test123',
          gitlabUrl: 'https://gitlab.test',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 400 if validation fails', async () => {
      vi.spyOn(gitlabService, 'validateGitlabPAT').mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/integration',
        payload: {
          token: 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/gitlab/integration', () => {
    it('should remove GitLab integration', async () => {
      vi.spyOn(gitlabService, 'deleteGitlabIntegration').mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/gitlab/integration',
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('GET /api/gitlab/projects', () => {
    it('should list user\'s GitLab projects', async () => {
      vi.spyOn(gitlabService, 'listGitlabProjects').mockResolvedValue([
        { id: 123, name: 'test-repo', path_with_namespace: 'user/test-repo' },
        { id: 456, name: 'another-repo', path_with_namespace: 'user/another-repo' },
      ] as any);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/gitlab/projects',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { id: 123, name: 'test-repo', path_with_namespace: 'user/test-repo' },
        { id: 456, name: 'another-repo', path_with_namespace: 'user/another-repo' },
      ]);
    });
  });

  describe('POST /api/gitlab/link', () => {
    it('should link project to GitLab repository', async () => {
      vi.spyOn(gitlabService, 'linkRepository').mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/link',
        payload: {
          projectId: testProjectId,
          gitlabProjectId: testGitlabProjectId,
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 400 if projectId is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/link',
        payload: {
          gitlabProjectId: testGitlabProjectId,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/gitlab/unlink/:projectId', () => {
    it('should unlink repository from project', async () => {
      vi.spyOn(gitlabService, 'unlinkRepository').mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/gitlab/unlink/${testProjectId}`,
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('GET /api/gitlab/branches/:projectId', () => {
    it('should list branches for a project', async () => {
      vi.spyOn(gitlabService, 'listBranches').mockResolvedValue(['main', 'develop', 'feature/test']);

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/gitlab/branches/${testProjectId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(['main', 'develop', 'feature/test']);
    });
  });

  describe('GET /api/gitlab/files/:projectId', () => {
    it('should list RPY files in repository', async () => {
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' },
        { name: 'chapter1.rpy', path: 'game/chapter1.rpy' },
      ] as any);

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/gitlab/files/${testProjectId}?branch=${testBranch}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { name: 'script.rpy', path: 'game/script.rpy' },
        { name: 'chapter1.rpy', path: 'game/chapter1.rpy' },
      ]);
    });

    it('should return 400 if branch is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/gitlab/files/${testProjectId}`,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/gitlab/export', () => {
    it('should export scenes to GitLab', async () => {
      vi.spyOn(gitlabSyncService, 'exportToGitlab').mockResolvedValue({
        id: testOperationId,
        projectId: testProjectId,
        operation: 'export',
        status: 'completed',
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
      } as any);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/export',
        payload: {
          projectId: testProjectId,
          branch: testBranch,
          commitMessage: 'Export from BranchForge',
        },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        id: testOperationId,
        operation: 'export',
        status: 'completed',
      });
    });

    it('should return 400 if projectId is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/export',
        payload: {
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/gitlab/import', () => {
    it('should import RPY files from GitLab', async () => {
      vi.spyOn(gitlabSyncService, 'importFromGitlab').mockResolvedValue({
        id: testOperationId,
        projectId: testProjectId,
        operation: 'import',
        status: 'completed',
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
      } as any);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/import',
        payload: {
          projectId: testProjectId,
          branch: testBranch,
          conflictResolution: 'branchforge_wins',
        },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        id: testOperationId,
        operation: 'import',
        status: 'completed',
      });
    });

    it('should return 400 if conflictResolution is invalid', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/import',
        payload: {
          projectId: testProjectId,
          branch: testBranch,
          conflictResolution: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/gitlab/operations/:operationId', () => {
    it('should get sync operation status', async () => {
      vi.spyOn(gitlabSyncService, 'getSyncOperation').mockResolvedValue({
        id: testOperationId,
        projectId: testProjectId,
        operation: 'export',
        status: 'completed',
        branch: testBranch,
        conflictCount: 0,
        startedAt: new Date(),
      } as any);

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/gitlab/operations/${testOperationId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: testOperationId,
        operation: 'export',
        status: 'completed',
      });
    });

    it('should return 404 if operation not found', async () => {
      vi.spyOn(gitlabSyncService, 'getSyncOperation').mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/gitlab/operations/non-existent`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/gitlab/operations/:projectId', () => {
    it('should list sync operations for a project', async () => {
      vi.spyOn(gitlabSyncService, 'listSyncOperations').mockResolvedValue([
        {
          id: 'op-1',
          projectId: testProjectId,
          operation: 'export',
          status: 'completed',
          branch: testBranch,
          conflictCount: 0,
          startedAt: new Date(),
        },
        {
          id: 'op-2',
          projectId: testProjectId,
          operation: 'import',
          status: 'completed',
          branch: 'develop',
          conflictCount: 0,
          startedAt: new Date(),
        },
      ] as any);

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/gitlab/projects/${testProjectId}/operations`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });
  });

  describe('POST /api/gitlab/detect-conflicts', () => {
    it('should detect conflicts between local and remote', async () => {
      vi.spyOn(gitlabSyncService, 'detectConflicts').mockResolvedValue({
        hasConflicts: true,
        conflicts: [
          {
            label: 'start',
            type: 'dialogue_mismatch',
            localContent: [{ speaker: null, text: 'Local content' }],
            remoteContent: [{ speaker: null, text: 'Remote content' }],
          },
        ],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/gitlab/detect-conflicts',
        payload: {
          projectId: testProjectId,
          branch: testBranch,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasConflicts: true,
        conflicts: [
          {
            label: 'start',
            type: 'dialogue_mismatch',
          },
        ],
      });
    });
  });
});
