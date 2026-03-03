/**
 * GitLab Sync Service Integration Tests
 *
 * Tests for the GitLab sync service against a real database.
 * These tests cover the detectConflicts function which involves complex
 * queries with joins between sceneLines and characters tables.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import nock from 'nock';
import * as gitlabService from '../gitlab.service.js';
import * as rpyParserService from '../rpy-parser.service.js';
import { getDb } from '../../db/index.js';
import { users, projects, scenes as scenesTable, sceneLines, characters } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { detectConflicts } from '../gitlab-sync.service.js';

describe('GitLabSyncService (Integration)', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const testProjectId = '10000000-0000-0000-0000-000000000001';
  const testBranch = 'main';

  const testUser = {
    id: testUserId,
    email: 'owner@test.com',
    passwordHash: 'hashed_password',
    role: 'OWNER',
  };

  const testProject = {
    id: testProjectId,
    userId: testUserId,
    name: 'Test Project',
    type: 'PREQUEL',
    description: 'A test project',
    maxMeterDelta: 10,
  };

  const testScene = {
    id: '20000000-0000-0000-0000-000000000001',
    projectId: testProjectId,
    title: 'start',
    act: null,
    chapter: null,
    sceneNumber: 1,
    sequenceOrder: 0,
    route: 'COMMON',
    status: 'DRAFT',
    prerequisites: {},
    effects: {},
  };

  const testCharacter = {
    id: '30000000-0000-0000-0000-000000000001',
    projectId: testProjectId,
    name: 'Sylvie',
    displayName: 'Sylvie',
    renpyTag: 's',
    routeAffiliation: 'SHARED',
    isLoveInterest: true,
    color: '#c8ffc8',
  };

  // Helper to clean up all test data
  async function cleanupTestData() {
    await db.delete(sceneLines).where(eq(sceneLines.sceneId, testScene.id));
    await db.delete(scenesTable).where(eq(scenesTable.id, testScene.id));
    await db.delete(characters).where(eq(characters.id, testCharacter.id));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert user and project
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    nock.cleanAll();
    nock.disableNetConnect();
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await cleanupTestData();
  });

  describe('detectConflicts', () => {
    it('should detect no conflicts when local and remote are in sync', async () => {
      // Set up local scene with lines
      await db.insert(scenesTable).values(testScene);

      // Insert a line with the same content as remote
      await db.insert(sceneLines).values({
        id: '40000000-0000-0000-0000-000000000001',
        sceneId: testScene.id,
        sequence: 1,
        contentType: 'NARRATION',
        content: 'Same content',
        visualType: 'GENERATED',
      });

      // Mock GitLab API to return the same content
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Same content"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFile').mockReturnValue({
        labels: ['start'],
        dialogue: [{ speaker: null, text: 'Same content' }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });
    });

    it('should detect conflicts when local and remote content differs', async () => {
      // Set up local scene with lines
      await db.insert(scenesTable).values(testScene);

      // Insert a line with different content than remote
      await db.insert(sceneLines).values({
        id: '40000000-0000-0000-0000-000000000001',
        sceneId: testScene.id,
        sequence: 1,
        contentType: 'NARRATION',
        content: 'Local content',
        visualType: 'GENERATED',
      });

      // Mock GitLab API to return different content
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Remote content"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFile').mockReturnValue({
        labels: ['start'],
        dialogue: [{ speaker: null, text: 'Remote content' }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: 'start',
        type: 'dialogue_mismatch',
      });
    });

    it('should detect new remote labels', async () => {
      // No local scenes
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'chapter2.rpy', path: 'game/chapter2.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label chapter2:\n    "New chapter"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFile').mockReturnValue({
        labels: ['chapter2'],
        dialogue: [{ speaker: null, text: 'New chapter' }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: 'chapter2',
        type: 'new_remote_label',
      });
    });

    it('should detect deleted remote labels', async () => {
      // Set up local scene
      await db.insert(scenesTable).values(testScene);

      // Mock GitLab API to return no files
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([]);

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: 'start',
        type: 'deleted_remote_label',
      });
    });

    it('should detect conflicts when dialogue with speakers differs', async () => {
      // Set up local scene with character
      await db.insert(scenesTable).values(testScene);
      await db.insert(characters).values(testCharacter);

      // Insert dialogue lines with speaker
      await db.insert(sceneLines).values([
        {
          id: '40000000-0000-0000-0000-000000000001',
          sceneId: testScene.id,
          sequence: 1,
          contentType: 'DIALOGUE',
          content: 'Local dialogue',
          speakerId: testCharacter.id,
          visualType: 'GENERATED',
        },
      ]);

      // Mock GitLab API to return different dialogue
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    s "Remote dialogue"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFile').mockReturnValue({
        labels: ['start'],
        dialogue: [{ speaker: 's', text: 'Remote dialogue' }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: 'start',
        type: 'dialogue_mismatch',
      });
    });

    it('should detect no conflicts when dialogue with speakers matches', async () => {
      // Set up local scene with character
      await db.insert(scenesTable).values(testScene);
      await db.insert(characters).values(testCharacter);

      // Insert dialogue lines with speaker matching remote
      await db.insert(sceneLines).values([
        {
          id: '40000000-0000-0000-0000-000000000001',
          sceneId: testScene.id,
          sequence: 1,
          contentType: 'DIALOGUE',
          content: 'Same dialogue',
          speakerId: testCharacter.id,
          visualType: 'GENERATED',
        },
      ]);

      // Mock GitLab API to return the same dialogue
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    s "Same dialogue"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFile').mockReturnValue({
        labels: ['start'],
        dialogue: [{ speaker: 's', text: 'Same dialogue' }],
        choices: [],
        jumps: [],
        characters: [],
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });
    });

    it('should handle multiple conflict types simultaneously', async () => {
      // Set up local scene with lines
      await db.insert(scenesTable).values(testScene);

      await db.insert(sceneLines).values({
        id: '40000000-0000-0000-0000-000000000001',
        sceneId: testScene.id,
        sequence: 1,
        contentType: 'NARRATION',
        content: 'Local content',
        visualType: 'GENERATED',
      });

      // Mock GitLab API to return different content AND a new label
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
        { name: 'chapter2.rpy', path: 'game/chapter2.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent')
        .mockResolvedValueOnce('label start:\n    "Remote change"\n    return')
        .mockResolvedValueOnce('label chapter2:\n    "New remote"\n    return');

      vi.spyOn(rpyParserService, 'parseRPYFile')
        .mockReturnValueOnce({
          labels: ['start'],
          dialogue: [{ speaker: null, text: 'Remote change' }],
          choices: [],
          jumps: [],
          characters: [],
        })
        .mockReturnValueOnce({
          labels: ['chapter2'],
          dialogue: [{ speaker: null, text: 'New remote' }],
          choices: [],
          jumps: [],
          characters: [],
        });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(2);

      const conflictLabels = result.conflicts.map(c => c.label);
      expect(conflictLabels).toContain('start');
      expect(conflictLabels).toContain('chapter2');

      const conflictTypes = result.conflicts.map(c => c.type);
      expect(conflictTypes).toContain('dialogue_mismatch');
      expect(conflictTypes).toContain('new_remote_label');
    });

    it('should handle API errors gracefully', async () => {
      // Set up local scene
      await db.insert(scenesTable).values(testScene);

      // Mock GitLab API to throw error
      vi.spyOn(gitlabService, 'listRpyFiles').mockRejectedValue(
        new Error('API Error'),
      );

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
        error: 'API Error',
      });
    });

    it('should handle multiple scenes and lines correctly', async () => {
      // Set up two local scenes with multiple lines
      const testScene2 = {
        id: '20000000-0000-0000-0000-000000000002',
        projectId: testProjectId,
        title: 'chapter1',
        act: null,
        chapter: null,
        sceneNumber: 2,
        sequenceOrder: 1,
        route: 'COMMON',
        status: 'DRAFT',
        prerequisites: {},
        effects: {},
      };

      await db.insert(scenesTable).values([testScene, testScene2]);

      await db.insert(sceneLines).values([
        {
          id: '40000000-0000-0000-0000-000000000001',
          sceneId: testScene.id,
          sequence: 1,
          contentType: 'NARRATION',
          content: 'Line 1',
          visualType: 'GENERATED',
        },
        {
          id: '40000000-0000-0000-0000-000000000002',
          sceneId: testScene.id,
          sequence: 2,
          contentType: 'NARRATION',
          content: 'Line 2',
          visualType: 'GENERATED',
        },
        {
          id: '40000000-0000-0000-0000-000000000003',
          sceneId: testScene2.id,
          sequence: 1,
          contentType: 'NARRATION',
          content: 'Chapter 1 Line 1',
          visualType: 'GENERATED',
        },
      ]);

      // Mock GitLab API to return matching content for each scene
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'start.rpy', path: 'game/start.rpy' } as any,
        { name: 'chapter1.rpy', path: 'game/chapter1.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent')
        .mockResolvedValueOnce('label start:\n    "Line 1"\n    "Line 2"\n    return')
        .mockResolvedValueOnce('label chapter1:\n    "Chapter 1 Line 1"\n    return');

      // Mock separate file parses for each scene
      vi.spyOn(rpyParserService, 'parseRPYFile')
        .mockReturnValueOnce({
          labels: ['start'],
          dialogue: [
            { speaker: null, text: 'Line 1' },
            { speaker: null, text: 'Line 2' },
          ],
          choices: [],
          jumps: [],
          characters: [],
        })
        .mockReturnValueOnce({
          labels: ['chapter1'],
          dialogue: [
            { speaker: null, text: 'Chapter 1 Line 1' },
          ],
          choices: [],
          jumps: [],
          characters: [],
        });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });

      // Cleanup
      await db.delete(sceneLines).where(eq(sceneLines.sceneId, testScene2.id));
      await db.delete(scenesTable).where(eq(scenesTable.id, testScene2.id));
    });
  });
});
