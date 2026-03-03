/**
 * Scenes Routes Unit Tests
 *
 * Tests for the scenes API routes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { scenesRoutes } from '../scenes.routes.js';
import * as scenesService from '../../services/scenes.service.js';

// Mock the scenes service
vi.mock('../../services/scenes.service.js', () => ({
  listScenes: vi.fn(),
  getScene: vi.fn(),
  authorizeSceneAccess: vi.fn(),
}));

// Mock the authenticate middleware to attach a test user
vi.mock('../../middleware/auth.middleware.js', () => ({
  authenticate: async (request: any, reply: any) => {
    (request as any).user = { id: 'user-123', email: 'test@example.com', role: 'OWNER' as const };
  },
}));

describe('ScenesRoutes', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a fresh Fastify instance for each test
    fastify = Fastify();

    // Register the routes
    await scenesRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  describe('GET /scenes', () => {
    it('should return empty array when project has no scenes', async () => {
      vi.mocked(scenesService.listScenes).mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes?projectId=project-123',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ scenes: [] });
    });

    it('should return list of scenes for a project', async () => {
      const mockScenes = [
        {
          id: 'scene-1',
          projectId: 'project-123',
          title: 'chapter1_scene1',
          act: 'I',
          chapter: 1,
          sceneNumber: 1,
          sequenceOrder: 0,
          route: 'COMMON',
          status: 'DRAFT' as const,
          visibility: 'EXCLUSIVE' as const,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(scenesService.listScenes).mockResolvedValue(mockScenes);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes?projectId=project-123',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes).toHaveLength(1);
      expect(json.scenes[0].id).toBe('scene-1');
      expect(json.scenes[0].title).toBe('chapter1_scene1');
    });

    it('should filter by route when provided', async () => {
      const mockScenes = [
        {
          id: 'scene-1',
          projectId: 'project-123',
          title: 'chapter1_scene1',
          act: 'I',
          chapter: 1,
          sceneNumber: 1,
          sequenceOrder: 0,
          route: 'EILEEN',
          status: 'DRAFT' as const,
          visibility: 'EXCLUSIVE' as const,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(scenesService.listScenes).mockResolvedValue(mockScenes);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes?projectId=project-123&route=EILEEN',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes[0].route).toBe('EILEEN');
    });

    it('should filter by status when provided', async () => {
      const mockScenes = [
        {
          id: 'scene-1',
          projectId: 'project-123',
          title: 'chapter1_scene1',
          act: 'I',
          chapter: 1,
          sceneNumber: 1,
          sequenceOrder: 0,
          route: 'COMMON',
          status: 'FINAL' as const,
          visibility: 'EXCLUSIVE' as const,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(scenesService.listScenes).mockResolvedValue(mockScenes);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes?projectId=project-123&status=FINAL',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scenes[0].status).toBe('FINAL');
    });

    it('should return 400 when projectId is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Project ID is required' });
    });

    it('should pass route and status filters to listScenes', async () => {
      vi.mocked(scenesService.listScenes).mockResolvedValue([]);

      await fastify.inject({
        method: 'GET',
        url: '/scenes?projectId=project-123&route=EILEEN&status=FINAL',
      });

      expect(scenesService.listScenes).toHaveBeenCalledWith(
        'project-123',
        'user-123',
        { route: 'EILEEN', status: 'FINAL' },
      );
    });
  });

  describe('GET /scenes/:sceneId', () => {
    it('should return scene when found and accessible', async () => {
      const mockScene = {
        id: 'scene-123',
        projectId: 'project-123',
        title: 'chapter1_scene1',
        act: 'I',
        chapter: 1,
        sceneNumber: 1,
        sequenceOrder: 0,
        route: 'COMMON',
        status: 'DRAFT' as const,
        visibility: 'EXCLUSIVE' as const,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        lines: [],
        characters: [],
      };

      vi.mocked(scenesService.getScene).mockResolvedValue(mockScene);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes/scene-123',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scene.id).toBe('scene-123');
      expect(json.scene.title).toBe('chapter1_scene1');
    });

    it('should return 404 when scene not found', async () => {
      vi.mocked(scenesService.getScene).mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes/scene-123',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Scene not found' });
    });

    it('should return scene with lines and characters', async () => {
      const mockScene = {
        id: 'scene-123',
        projectId: 'project-123',
        title: 'chapter1_scene1',
        act: 'I',
        chapter: 1,
        sceneNumber: 1,
        sequenceOrder: 0,
        route: 'COMMON',
        status: 'DRAFT' as const,
        visibility: 'EXCLUSIVE' as const,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        lines: [
          {
            id: 'line-1',
            sceneId: 'scene-123',
            sequence: 1,
            contentType: 'DIALOGUE' as const,
            content: 'Hello world!',
            speakerId: 'char-1',
            speakerName: 'Eileen',
            speakerTag: 'a',
            visualType: 'GENERATED' as const,
            visualSlugOverride: null,
            customVisualName: null,
            menuOptions: null,
            wordCount: null,
            demoPlaceholderColor: null,
            demoNotes: null,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
        ],
        characters: [
          {
            id: 'char-1',
            name: 'Eileen',
            displayName: 'Eileen',
            renpyTag: 'a',
            role: 'PRIMARY' as const,
            emotion: null,
            notes: null,
          },
        ],
      };

      vi.mocked(scenesService.getScene).mockResolvedValue(mockScene);

      const response = await fastify.inject({
        method: 'GET',
        url: '/scenes/scene-123',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.scene.lines).toHaveLength(1);
      expect(json.scene.lines[0].content).toBe('Hello world!');
      expect(json.scene.characters).toHaveLength(1);
      expect(json.scene.characters[0].name).toBe('Eileen');
    });
  });
});
