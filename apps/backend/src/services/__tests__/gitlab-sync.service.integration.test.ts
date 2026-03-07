/**
 * GitLab Sync Service Integration Tests
 *
 * Tests for the GitLab sync service against a real database.
 * Tests cover the new file-based architecture with gitlabFiles table.
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
import { users, projects, scenes as scenesTable, sceneLines, characters, gitlabFiles, gitlabSyncOperations } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { detectConflicts, exportToGitlab, importFromGitlab, type ConflictResolution } from '../gitlab-sync.service.js';

describe('GitLabSyncService (Integration)', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures with hardcoded UUIDs
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const testProjectId = '10000000-0000-0000-0000-000000000001';
  const testGitlabFileId = '50000000-0000-0000-0000-000000000001';
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

  const testGitlabFile = {
    id: testGitlabFileId,
    projectId: testProjectId,
    filePath: 'game/script.rpy',
    fileType: 'STORY',
    content: 'label start:\n    "Content"\n    return',
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
    gitlabFileId: testGitlabFileId,
    labelName: 'start',
    labelPosition: 0,
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
    await db.delete(gitlabFiles).where(eq(gitlabFiles.projectId, testProjectId));
    await db.delete(gitlabSyncOperations).where(eq(gitlabSyncOperations.projectId, testProjectId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  }

  // Helper to clean up additional test data (for multi-scene tests)
  async function cleanupAdditionalData(sceneIds: string[]) {
    for (const sceneId of sceneIds) {
      await db.delete(sceneLines).where(eq(sceneLines.sceneId, sceneId));
      await db.delete(scenesTable).where(eq(scenesTable.id, sceneId));
    }
  }

  // Helper to set up test data
  async function setupTestData(includeGitlabFile = false) {
    // Insert user and project
    await db.insert(users).values(testUser);
    await db.insert(projects).values(testProject);
    if (includeGitlabFile) {
      await db.insert(gitlabFiles).values(testGitlabFile);
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    nock.cleanAll();
    nock.disableNetConnect();
    await cleanupTestData();
    await setupTestData(true); // Include gitlabFile by default
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

      // Mock GitLab API to return the same content (for getFileContent)
      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Same content"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'Same content', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
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

      // Mock GitLab API to return different content (for getFileContent)
      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Remote content"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'Remote content', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
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
      // First, clean up the default gitlab file to avoid extra conflicts
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, testGitlabFileId));

      // Create a gitlab file with a new label that doesn't exist locally
      const newGitlabFile = {
        id: '50000000-0000-0000-0000-000000000002',
        projectId: testProjectId,
        filePath: 'game/chapter2.rpy',
        fileType: 'STORY' as const,
        content: 'label chapter2:\n    "New chapter"\n    return',
      };
      await db.insert(gitlabFiles).values(newGitlabFile);

      // Mock GitLab API to return the new label content
      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label chapter2:\n    "New chapter"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'chapter2',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'New chapter', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        label: 'chapter2',
        type: 'new_remote_label',
      });

      // Cleanup
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, newGitlabFile.id));
      // Restore the default gitlab file
      await db.insert(gitlabFiles).values(testGitlabFile);
    });

    it('should detect deleted remote labels', async () => {
      // Set up local scene
      await db.insert(scenesTable).values(testScene);

      // Mock GitLab API to return empty content (file deleted or label removed)
      // We need to mock the getFileContent to return a file with different labels
      let callCount = 0;
      vi.spyOn(gitlabService, 'getFileContent').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call for testGitlabFile - return different label
          return Promise.resolve(
            'label other:\n    "Other content"\n    return',
          );
        }
        return Promise.resolve('');
      });

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'other',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'Other content', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
      });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result.hasConflicts).toBe(true);
      // We expect 2 conflicts: "other" is a new remote label, and "start" was deleted remotely
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);

      // Check that we have the deleted_remote_label conflict
      const deletedConflict = result.conflicts.find(c => c.type === 'deleted_remote_label');
      expect(deletedConflict).toMatchObject({
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
      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    s "Remote dialogue"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: 's', text: 'Remote dialogue', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
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
      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    s "Same dialogue"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: 's', text: 'Same dialogue', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
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

      // Create another gitlab file for a new label
      const newGitlabFile = {
        id: '50000000-0000-0000-0000-000000000002',
        projectId: testProjectId,
        filePath: 'game/chapter2.rpy',
        fileType: 'STORY' as const,
        content: 'label chapter2:\n    "New remote"\n    return',
      };
      await db.insert(gitlabFiles).values(newGitlabFile);

      // Mock GitLab API to return different content AND a new label
      vi.spyOn(gitlabService, 'getFileContent')
        .mockResolvedValueOnce('label start:\n    "Remote change"\n    return')
        .mockResolvedValueOnce('label chapter2:\n    "New remote"\n    return');

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels')
        .mockReturnValueOnce({
          labels: [
            {
              label: 'start',
              lineNumber: 1,
              dialogue: [{ speaker: null, text: 'Remote change', lineNumber: 2 }],
              choices: [],
              jumps: [],
            },
          ],
          characters: [],
          fileType: 'STORY',
        })
        .mockReturnValueOnce({
          labels: [
            {
              label: 'chapter2',
              lineNumber: 1,
              dialogue: [{ speaker: null, text: 'New remote', lineNumber: 2 }],
              choices: [],
              jumps: [],
            },
          ],
          characters: [],
          fileType: 'STORY',
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

      // Cleanup
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, newGitlabFile.id));
    });

    it('should handle API errors gracefully', async () => {
      // Set up local scene
      await db.insert(scenesTable).values(testScene);

      // Mock GitLab API to throw error
      vi.spyOn(gitlabService, 'getFileContent').mockRejectedValue(
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
      // Create another gitlab file for the second scene
      const testGitlabFile2 = {
        id: '50000000-0000-0000-0000-000000000002',
        projectId: testProjectId,
        filePath: 'game/chapter1.rpy',
        fileType: 'STORY' as const,
        content: 'label chapter1:\n    "Chapter 1 Line 1"\n    return',
      };
      await db.insert(gitlabFiles).values(testGitlabFile2);

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
        gitlabFileId: testGitlabFile2.id,
        labelName: 'chapter1',
        labelPosition: 0,
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
      vi.spyOn(gitlabService, 'getFileContent')
        .mockResolvedValueOnce('label start:\n    "Line 1"\n    "Line 2"\n    return')
        .mockResolvedValueOnce('label chapter1:\n    "Chapter 1 Line 1"\n    return');

      // Mock separate file parses for each scene
      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels')
        .mockReturnValueOnce({
          labels: [
            {
              label: 'start',
              lineNumber: 1,
              dialogue: [
                { speaker: null, text: 'Line 1', lineNumber: 2 },
                { speaker: null, text: 'Line 2', lineNumber: 3 },
              ],
              choices: [],
              jumps: [],
            },
          ],
          characters: [],
          fileType: 'STORY',
        })
        .mockReturnValueOnce({
          labels: [
            {
              label: 'chapter1',
              lineNumber: 1,
              dialogue: [{ speaker: null, text: 'Chapter 1 Line 1', lineNumber: 2 }],
              choices: [],
              jumps: [],
            },
          ],
          characters: [],
          fileType: 'STORY',
        });

      const result = await detectConflicts(testProjectId, testBranch);

      expect(result).toMatchObject({
        hasConflicts: false,
        conflicts: [],
      });

      // Cleanup
      await db.delete(sceneLines).where(eq(sceneLines.sceneId, testScene2.id));
      await db.delete(scenesTable).where(eq(scenesTable.id, testScene2.id));
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, testGitlabFile2.id));
    });
  });

  describe('exportToGitlab', () => {
    it('should export files to GitLab when files exist', async () => {
      // Mock the GitLab service
      vi.spyOn(gitlabService, 'createOrUpdateFile').mockResolvedValue({
        file_path: testGitlabFile.filePath,
        branch: testBranch,
      } as any);

      const result = await exportToGitlab(testProjectId, testBranch, 'Test export');

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: 'export',
        status: 'completed',
        branch: testBranch,
        conflictCount: 0,
      });
      expect(gitlabService.createOrUpdateFile).toHaveBeenCalledWith(
        testProjectId,
        testBranch,
        testGitlabFile.filePath,
        testGitlabFile.content,
        'Test export',
      );
    });

    it('should handle export when no files exist', async () => {
      // Delete the gitlab file first
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, testGitlabFileId));

      // Mock the GitLab service (should not be called)
      const createOrUpdateFileSpy = vi.spyOn(gitlabService, 'createOrUpdateFile').mockResolvedValue({
        file_path: 'game/script.rpy',
        branch: testBranch,
      } as any);

      const result = await exportToGitlab(testProjectId, testBranch, 'Test export');

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: 'export',
        status: 'completed',
        branch: testBranch,
        conflictCount: 0,
      });
      expect(createOrUpdateFileSpy).not.toHaveBeenCalled();
    });

    it('should handle GitLab API errors', async () => {
      // Mock the GitLab service to throw error
      vi.spyOn(gitlabService, 'createOrUpdateFile').mockRejectedValue(
        new Error('GitLab API Error'),
      );

      const result = await exportToGitlab(testProjectId, testBranch, 'Test export');

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: 'export',
        status: 'failed',
        errorMessage: 'GitLab API Error',
      });
    });

    it('should generate default commit message when not provided', async () => {
      vi.spyOn(gitlabService, 'createOrUpdateFile').mockResolvedValue({
        file_path: testGitlabFile.filePath,
        branch: testBranch,
      } as any);

      await exportToGitlab(testProjectId, testBranch);

      expect(gitlabService.createOrUpdateFile).toHaveBeenCalled();
      const calls = (gitlabService.createOrUpdateFile as any).mock.calls;
      // createOrUpdateFile(projectId, branch, filePath, content, commitMessage)
      // The commit message is at index 4
      expect(calls.length).toBeGreaterThan(0);
      const commitMessage = calls[0][4];
      expect(commitMessage).toMatch(/Export from BranchForge -/);
    });

    it('should export multiple files', async () => {
      // Create additional gitlab files
      const testGitlabFile2 = {
        id: '50000000-0000-0000-0000-000000000002',
        projectId: testProjectId,
        filePath: 'game/chapter1.rpy',
        fileType: 'STORY' as const,
        content: 'label chapter1:\n    "Content"\n    return',
      };
      await db.insert(gitlabFiles).values(testGitlabFile2);

      const createOrUpdateFileSpy = vi.spyOn(gitlabService, 'createOrUpdateFile')
        .mockResolvedValueOnce({
          file_path: testGitlabFile.filePath,
          branch: testBranch,
        } as any)
        .mockResolvedValueOnce({
          file_path: testGitlabFile2.filePath,
          branch: testBranch,
        } as any);

      const result = await exportToGitlab(testProjectId, testBranch, 'Test export');

      expect(result.status).toBe('completed');
      expect(createOrUpdateFileSpy).toHaveBeenCalledTimes(2);

      // Cleanup
      await db.delete(gitlabFiles).where(eq(gitlabFiles.id, testGitlabFile2.id));
    });
  });

  describe('importFromGitlab', () => {
    it('should import files from GitLab', async () => {
      // Mock the GitLab service
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Imported content"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'Imported content', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
      });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        'branchforge_wins' as ConflictResolution,
      );

      expect(result).toMatchObject({
        projectId: testProjectId,
        operation: 'import',
        status: 'completed',
        branch: testBranch,
        conflictCount: 0,
      });

      // Verify gitlab file was created
      const [gitlabFile] = await db
        .select()
        .from(gitlabFiles)
        .where(eq(gitlabFiles.filePath, 'game/script.rpy'));
      expect(gitlabFile).toBeDefined();
      expect(gitlabFile?.content).toBe('label start:\n    "Imported content"\n    return');

      // Verify scene was created with linkage
      const [scene] = await db
        .select()
        .from(scenesTable)
        .where(eq(scenesTable.title, 'start'));
      expect(scene).toBeDefined();
      expect(scene?.gitlabFileId).toBe(gitlabFile?.id);
      expect(scene?.labelName).toBe('start');

      // Cleanup
      if (scene) {
        await db.delete(sceneLines).where(eq(sceneLines.sceneId, scene.id));
        await db.delete(scenesTable).where(eq(scenesTable.id, scene.id));
      }
      if (gitlabFile) {
        await db.delete(gitlabFiles).where(eq(gitlabFiles.id, gitlabFile.id));
      }
    });

    it('should handle import from empty repository', async () => {
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([]);

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        'branchforge_wins' as ConflictResolution,
      );

      expect(result).toMatchObject({
        status: 'completed',
        conflictCount: 0,
      });
    });

    it('should handle gitlab_wins conflict resolution', async () => {
      // Create an existing scene
      await db.insert(scenesTable).values(testScene);

      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Updated from GitLab"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'Updated from GitLab', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
      });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        'gitlab_wins' as ConflictResolution,
      );

      expect(result.status).toBe('completed');
      expect(result.conflictCount).toBe(0);
    });

    it('should handle manual_review conflict resolution', async () => {
      // Create an existing scene
      await db.insert(scenesTable).values(testScene);

      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'label start:\n    "Conflicting content"\n    return',
      );

      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [
          {
            label: 'start',
            lineNumber: 1,
            dialogue: [{ speaker: null, text: 'Conflicting content', lineNumber: 2 }],
            choices: [],
            jumps: [],
          },
        ],
        characters: [],
        fileType: 'STORY',
      });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        'manual_review' as ConflictResolution,
      );

      expect(result.status).toBe('completed');
      expect(result.conflictCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle API errors', async () => {
      vi.spyOn(gitlabService, 'listRpyFiles').mockRejectedValue(
        new Error('API Error'),
      );

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        'branchforge_wins' as ConflictResolution,
      );

      expect(result).toMatchObject({
        status: 'failed',
        errorMessage: 'API Error',
      });
    });

    it('should handle invalid RPY content gracefully', async () => {
      vi.spyOn(gitlabService, 'listRpyFiles').mockResolvedValue([
        { name: 'script.rpy', path: 'game/script.rpy' } as any,
      ]);

      vi.spyOn(gitlabService, 'getFileContent').mockResolvedValue(
        'invalid rpy content',
      );

      // Parse should still work, just return empty labels
      vi.spyOn(rpyParserService, 'parseRPYFileWithLabels').mockReturnValue({
        labels: [],
        characters: [],
        fileType: 'STORY',
      });

      const result = await importFromGitlab(
        testProjectId,
        testBranch,
        'branchforge_wins' as ConflictResolution,
      );

      expect(result.status).toBe('completed');
    });
  });
});
