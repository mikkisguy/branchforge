/**
 * Projects Routes Unit Tests
 *
 * Tests for the projects API routes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { projectsRoutes } from '../projects.routes.js';
import * as projectsService from '../../services/projects.service.js';

// Mock the projects service
vi.mock('../../services/projects.service.js', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
}));

// Mock the authenticate middleware to attach a test user
vi.mock('../../middleware/auth.middleware.js', () => ({
  authenticate: async (request: any, reply: any) => {
    (request as any).user = { id: 'user-123', email: 'test@example.com', role: 'OWNER' as const };
  },
}));

describe('ProjectsRoutes', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a fresh Fastify instance for each test
    fastify = Fastify();

    // Register the routes
    await projectsRoutes(fastify);
    await fastify.ready();
  });

  describe('GET /projects', () => {
    it('should return empty array when user has no projects', async () => {
      vi.mocked(projectsService.listProjects).mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/projects',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: [] });
    });

    it('should return list of projects', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project',
          type: 'PREQUEL' as const,
          description: 'A test project',
          routeLockChapter: 1,
          maxMeterDelta: 10,
          visibility: 'OWNER' as const,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(projectsService.listProjects).mockResolvedValue(mockProjects);

      const response = await fastify.inject({
        method: 'GET',
        url: '/projects',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.projects).toHaveLength(1);
      expect(json.projects[0].id).toBe('project-1');
      expect(json.projects[0].name).toBe('Test Project');
    });
  });

  describe('GET /projects/:id', () => {
    it('should return project when found and accessible', async () => {
      const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        type: 'PREQUEL' as const,
        description: 'A test project',
        routeLockChapter: 1,
        maxMeterDelta: 10,
        visibility: 'OWNER' as const,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(projectsService.getProject).mockResolvedValue(mockProject);

      const response = await fastify.inject({
        method: 'GET',
        url: '/projects/project-123',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.project.id).toBe('project-123');
      expect(json.project.name).toBe('Test Project');
    });

    it('should return 404 when project not found', async () => {
      vi.mocked(projectsService.getProject).mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/projects/project-123',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Project not found' });
    });
  });

  describe('POST /projects', () => {
    it('should create project with valid data', async () => {
      const requestBody = {
        name: 'New Project',
        type: 'PREQUEL',
        description: 'A new project',
        routeLockChapter: 2,
        maxMeterDelta: 15,
      };

      const mockProject = {
        id: 'new-project-id',
        ...requestBody,
        visibility: 'OWNER' as const,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(projectsService.createProject).mockResolvedValue(mockProject);

      const response = await fastify.inject({
        method: 'POST',
        url: '/projects',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.project.id).toBe('new-project-id');
      expect(json.project.name).toBe('New Project');
    });

    it('should return 400 when name is missing', async () => {
      const requestBody = {
        name: '',
        type: 'PREQUEL',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/projects',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Project name is required' });
    });

    it('should return 400 when type is invalid', async () => {
      const requestBody = {
        name: 'New Project',
        type: 'INVALID',
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/projects',
        payload: requestBody,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Project type must be PREQUEL or SEQUEL' });
    });
  });
});
