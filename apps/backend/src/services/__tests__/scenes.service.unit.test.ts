/**
 * Scenes Service Unit Tests
 *
 * Tests for the scenes business logic layer.
 * Tests listing scenes, getting scene details, and authorization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as dbModule from '../../db/index.js';

// Mock the scene-characters schema table before importing the service
// This prevents circular dependency issues in the test environment
vi.mock('../../db/schema/tables/scene-characters.js', () => ({
  sceneCharacters: {
    role: 'role',
    emotion: 'emotion',
    notes: 'notes',
    sceneId: 'sceneId',
    characterId: 'characterId',
  },
}));

// Now import the service after the mock is set up
import {
  listScenes,
  getScene,
  authorizeSceneAccess,
  type SceneDetail,
  type SceneLineWithSpeaker,
} from '../scenes.service.js';

// Mock the database with a complete chain builder
const createMockChain = (resolveValue: any) => {
  const result = Promise.resolve(resolveValue);

  // Helper to create chain methods that preserve join capability
  const createJoinMethods = () => ({
    where: vi.fn(() => Object.assign(result, {
      orderBy: vi.fn(() => result),
      limit: vi.fn(() => result),
    })),
    orderBy: vi.fn(() => result),
    limit: vi.fn(() => result),
    innerJoin: vi.fn(() => createJoinMethods()),
    leftJoin: vi.fn(() => createJoinMethods()),
  });

  return {
    from: vi.fn(() => createJoinMethods()),
  };
};

// Use a function that returns a fresh chain each time
const createEmptyMockChain = () => createMockChain([]);
const mockSelect = vi.fn(createEmptyMockChain);

const mockDb = {
  select: mockSelect,
};

vi.mock('../../db/index.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

describe('ScenesService', () => {
  const userId = 'user-123';
  const projectId = 'project-123';
  const sceneId = 'scene-123';

  const mockScene = {
    id: sceneId,
    projectId,
    title: 'chapter1_scene1',
    act: 'I',
    chapter: 1,
    sceneNumber: 1,
    sequenceOrder: 0,
    route: 'COMMON',
    visibility: 'EXCLUSIVE',
    status: 'DRAFT',
    prerequisites: {},
    effects: {},
    crossRouteContext: null,
    readerNotes: null,
    duoPairId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockCharacter = {
    id: 'char-1',
    projectId,
    name: 'Eileen',
    displayName: 'Eileen',
    renpyTag: 'a',
    routeAffiliation: 'EILEEN',
    isLoveInterest: true,
    pairGroupId: null,
    dialogueStyle: null,
    conditionalPrefix: null,
    color: '#FF5733',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockSceneLine: SceneLineWithSpeaker = {
    id: 'line-1',
    sceneId,
    sequence: 1,
    contentType: 'DIALOGUE',
    content: 'Hello world!',
    speakerId: 'char-1',
    speakerName: 'Eileen',
    speakerTag: 'a',
    visualType: 'GENERATED',
    visualSlugOverride: null,
    customVisualName: null,
    menuOptions: null,
    wordCount: null,
    demoPlaceholderColor: null,
    demoNotes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listScenes', () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it('should return empty array when project has no scenes', async () => {
      const scenes = await listScenes(projectId, userId);
      expect(scenes).toEqual([]);
    });

    it('should return list of scenes for a project', async () => {
      mockSelect.mockImplementation(() => createMockChain([mockScene]));

      const scenes = await listScenes(projectId, userId);

      expect(scenes).toHaveLength(1);
      expect(scenes[0]).toEqual({
        id: sceneId,
        projectId,
        title: 'chapter1_scene1',
        act: 'I',
        chapter: 1,
        sceneNumber: 1,
        sequenceOrder: 0,
        route: 'COMMON',
        status: 'DRAFT',
        visibility: 'EXCLUSIVE',
        createdAt: mockScene.createdAt,
        updatedAt: mockScene.updatedAt,
      });
    });

    it('should return multiple scenes ordered by sequence', async () => {
      const scene2 = { ...mockScene, id: 'scene-2', sceneNumber: 2, sequenceOrder: 1 };
      mockSelect.mockImplementation(() => createMockChain([mockScene, scene2]));

      const scenes = await listScenes(projectId, userId);

      expect(scenes).toHaveLength(2);
      expect(scenes[0].sceneNumber).toBe(1);
      expect(scenes[1].sceneNumber).toBe(2);
    });
  });

  describe('getScene', () => {
    beforeEach(() => {
      mockSelect.mockImplementation(createEmptyMockChain);
    });

    it('should return scene with lines and characters when found', async () => {
      // Mock scene query
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get scene with project owner
          return createMockChain([{
            scene: mockScene,
            projectOwnerId: userId,
          }]);
        } else if (callCount === 2) {
          // Second call: get scene lines with speakers
          return createMockChain([{
            line: mockSceneLine,
            speakerName: 'Eileen',
            speakerTag: 'a',
          }]);
        } else {
          // Third call: get scene characters
          return createMockChain([{
            character: mockCharacter,
            role: 'PRIMARY',
            emotion: null,
            notes: null,
          }]);
        }
      });

      const scene = await getScene(sceneId, userId);

      expect(scene).not.toBeNull();
      expect(scene?.id).toBe(sceneId);
      expect(scene?.title).toBe('chapter1_scene1');
      expect(scene?.lines).toHaveLength(1);
      expect(scene?.lines[0].content).toBe('Hello world!');
      expect(scene?.characters).toHaveLength(1);
      expect(scene?.characters[0].name).toBe('Eileen');
    });

    it('should return null when scene not found', async () => {
      mockSelect.mockImplementation(createEmptyMockChain);

      const scene = await getScene(sceneId, userId);

      expect(scene).toBeNull();
    });

    it('should return scene with empty lines array when no lines exist', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: get scene with project owner
          return createMockChain([{
            scene: mockScene,
            projectOwnerId: userId,
          }]);
        }
        // All subsequent calls return empty
        return createMockChain([]);
      });

      const scene = await getScene(sceneId, userId);

      expect(scene).not.toBeNull();
      expect(scene?.lines).toEqual([]);
    });
  });

  // authorizeSceneAccess tests moved to integration tests due to complex ORM queries with joins
  // (scenes → projects → projectUsers)
});
