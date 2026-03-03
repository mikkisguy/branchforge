/**
 * Projects Service Integration Tests
 *
 * Tests for the projects service against a real database.
 * These tests cover complex queries that are difficult to mock.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDb } from '../../db/index.js';
import { users, projects, projectUsers, type NewUser, type NewProject, type NewProjectUser } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { listProjects } from '../projects.service.js';

describe('ProjectsService (Integration)', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Test fixtures
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const otherUserId = '00000000-0000-0000-0000-000000000002';
  const thirdUserId = '00000000-0000-0000-0000-000000000003';

  const testUser: NewUser = {
    id: testUserId,
    email: 'owner@test.com',
    passwordHash: 'hashed_password',
    role: 'OWNER',
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: 'other@test.com',
    passwordHash: 'hashed_password',
    role: 'OWNER',
  };

  const thirdUser: NewUser = {
    id: thirdUserId,
    email: 'third@test.com',
    passwordHash: 'hashed_password',
    role: 'READER',
  };

  const ownedProject: NewProject = {
    id: '10000000-0000-0000-0000-000000000001',
    userId: testUserId,
    name: 'Owned Project',
    type: 'PREQUEL',
    description: 'A project owned by the user',
    maxMeterDelta: 10,
  };

  const sharedProject: NewProject = {
    id: '10000000-0000-0000-0000-000000000002',
    userId: otherUserId,
    name: 'Shared Project',
    type: 'SEQUEL',
    description: 'A project shared with the user',
    maxMeterDelta: 15,
  };

  // Helper to clean up all test data including additional users created during tests
  async function cleanupTestData() {
    const ownedProjectId: string = ownedProject.id!;
    const sharedProjectId: string = sharedProject.id!;
    await db.delete(projectUsers).where(eq(projectUsers.userId, testUserId));
    await db.delete(projectUsers).where(eq(projectUsers.userId, otherUserId));
    await db.delete(projectUsers).where(eq(projectUsers.userId, thirdUserId));
    await db.delete(projects).where(eq(projects.id, ownedProjectId));
    await db.delete(projects).where(eq(projects.id, sharedProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, otherUserId));
    await db.delete(users).where(eq(users.id, thirdUserId));
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, sharedProject]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('listProjects', () => {
    const ownedProjectId: string = ownedProject.id!;
    const sharedProjectId: string = sharedProject.id!;

    it('should return empty array when user has no projects', async () => {
      // Clean up the test data to have no projects
      await cleanupTestData();

      // Create only the user, no projects
      await db.insert(users).values(testUser);

      const projects = await listProjects(testUserId);

      expect(projects).toEqual([]);
    });

    it('should return list of user-owned projects', async () => {
      const projects = await listProjects(testUserId);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        id: ownedProjectId,
        name: 'Owned Project',
        type: 'PREQUEL',
        description: 'A project owned by the user',
        maxMeterDelta: 10,
      });
      expect(projects[0].createdAt).toBeInstanceOf(Date);
      expect(projects[0].updatedAt).toBeInstanceOf(Date);
    });

    it('should return both owned and shared projects', async () => {
      // Share the other user's project with test user
      await db.insert(projectUsers).values({
        projectId: sharedProjectId,
        userId: testUserId,
        role: 'READER',
      });

      const projects = await listProjects(testUserId);

      expect(projects).toHaveLength(2);

      const projectNames = projects.map(p => p.name);
      expect(projectNames).toContain('Owned Project');
      expect(projectNames).toContain('Shared Project');

      // Verify visibility is set correctly
      const owned = projects.find(p => p.id === ownedProjectId);
      const shared = projects.find(p => p.id === sharedProjectId);

      expect(owned?.visibility).toBe('OWNER');
      expect(shared?.visibility).toBe('READER');
    });

    it('should not duplicate projects that are both owned and shared', async () => {
      // Share the owned project with the same user (edge case)
      await db.insert(projectUsers).values({
        projectId: ownedProjectId,
        userId: testUserId,
        role: 'READER',
      });

      const projects = await listProjects(testUserId);

      // Should still only have one project (the owned one)
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(ownedProjectId);
      expect(projects[0].visibility).toBe('OWNER'); // Should prioritize owner role
    });

    it('should return only shared projects when user owns none', async () => {
      // Create third user who only has shared access
      await db.insert(users).values(thirdUser);

      // Share owned project with third user
      await db.insert(projectUsers).values({
        projectId: ownedProjectId,
        userId: thirdUserId,
        role: 'READER',
      });

      const projects = await listProjects(thirdUserId);

      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(ownedProjectId);
      expect(projects[0].visibility).toBe('READER');
    });
  });
});
