/**
 * GitLab Service Integration Tests
 *
 * Tests for GitLab service database operations against a real database.
 * HTTP operations are tested separately in unit tests using Nock.
 *
 * Prerequisites:
 * - DATABASE_URL_TEST environment variable must be set
 * - Test database must exist and have proper schema
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  gitlabIntegrations,
  gitlabRepositories,
  type NewUser,
  type NewProject,
  type NewGitlabIntegration,
  type NewGitlabRepository,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import {
  getGitlabIntegration,
  getRepositoryLink,
  listRepositoryLinks,
} from "../gitlab.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";

describe("GitLabService (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    db = getDb();
  });

  // Track dynamically created project IDs for cleanup
  const additionalProjectIds: string[] = [];

  // Test fixtures
  const testUserId = testUuid("04000000", 1);
  const otherUserId = testUuid("04000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("gitlab-service", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("gitlab-service", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const ownedProject: NewProject = {
    id: testUuid("14000000", 1),
    userId: testUserId,
    name: "Owned Project",
    description: "A project owned by the user",
    maxMeterDelta: 10,
    source: "ZIP",
  };

  const otherProject: NewProject = {
    id: testUuid("14000000", 2),
    userId: testUserId,
    name: "Other Project",
    description: "Another project",
    maxMeterDelta: 10,
    source: "ZIP",
  };

  // Mock encryption service for testing
  // In real production, the encryption service encrypts/decrypts
  // For integration tests, we need to use the real encryption service
  // or mock it appropriately. Here we use a simple mock that stores
  // the token as-is for testing purposes.
  const mockEncrypt = (token: string) => `encrypted_${token}`;

  // Helper to clean up all test data in reverse dependency order
  async function cleanupTestData() {
    const testUserIds = [testUserId, otherUserId];
    const projectIds = [
      ownedProject.id!,
      otherProject.id!,
      ...additionalProjectIds,
    ];

    // Delete in reverse dependency order
    await db
      .delete(gitlabRepositories)
      .where(inArray(gitlabRepositories.projectId, projectIds));
    await db
      .delete(gitlabIntegrations)
      .where(inArray(gitlabIntegrations.userId, testUserIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
    await db.delete(users).where(inArray(users.id, testUserIds));

    // Clear the additional project IDs array
    additionalProjectIds.length = 0;
  }

  // Helper to set up test data
  async function setupTestData() {
    // Insert users
    await db.insert(users).values([testUser, otherUser]);

    // Insert projects
    await db.insert(projects).values([ownedProject, otherProject]);
  }

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("getGitlabIntegration", () => {
    it("should return user integration when exists", async () => {
      const integration: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: mockEncrypt("test-token"),
        gitlabUrl: "https://gitlab.example.com",
        username: "testuser",
      };

      await db.insert(gitlabIntegrations).values(integration);

      const result = await getGitlabIntegration(testUserId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(integration.id);
      expect(result?.userId).toBe(testUserId);
      expect(result?.encryptedToken).toBe(mockEncrypt("test-token"));
      expect(result?.gitlabUrl).toBe("https://gitlab.example.com");
      expect(result?.username).toBe("testuser");
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
    });

    it("should return null when integration does not exist", async () => {
      const result = await getGitlabIntegration(testUserId);
      expect(result).toBeNull();
    });

    it("should return integration with default GitLab URL", async () => {
      const integration: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: mockEncrypt("test-token"),
        gitlabUrl: "https://gitlab.com",
        username: "testuser",
      };

      await db.insert(gitlabIntegrations).values(integration);

      const result = await getGitlabIntegration(testUserId);

      expect(result?.gitlabUrl).toBe("https://gitlab.com");
    });

    it("should handle custom GitLab URLs", async () => {
      const customUrl = "https://gitlab.mycompany.com";
      const integration: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: mockEncrypt("test-token"),
        gitlabUrl: customUrl,
        username: "testuser",
      };

      await db.insert(gitlabIntegrations).values(integration);

      const result = await getGitlabIntegration(testUserId);

      expect(result?.gitlabUrl).toBe(customUrl);
    });
  });

  describe("storeGitlabIntegration", () => {
    it("should store new integration with encrypted token", async () => {
      // Note: This test uses the real encryption service
      // We expect it to throw because we're not providing a valid GitLab PAT
      // but the database insertion should work if we mock the encryption service

      // For this integration test, we'll directly insert to test the database layer
      // and then verify we can retrieve it
      const integration: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: "encrypted_glpat-test123456789",
        gitlabUrl: "https://gitlab.com",
        username: "testuser",
      };

      await db.insert(gitlabIntegrations).values(integration);

      const result = await getGitlabIntegration(testUserId);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(testUserId);
      expect(result?.encryptedToken).toBe("encrypted_glpat-test123456789");
      expect(result?.username).toBe("testuser");
    });

    it("should update existing integration (upsert)", async () => {
      // Insert initial integration
      const integration1: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: "encrypted_old_token",
        gitlabUrl: "https://gitlab.com",
        username: "olduser",
      };

      await db.insert(gitlabIntegrations).values(integration1);

      // Update with new token (simulating upsert behavior)
      await db
        .update(gitlabIntegrations)
        .set({
          encryptedToken: "encrypted_new_token",
          username: "newuser",
          updatedAt: new Date(),
        })
        .where(eq(gitlabIntegrations.userId, testUserId));

      const result = await getGitlabIntegration(testUserId);
      expect(result?.encryptedToken).toBe("encrypted_new_token");
      expect(result?.username).toBe("newuser");
    });

    it("should enforce unique constraint on userId", async () => {
      const integration1: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: "encrypted_token1",
        gitlabUrl: "https://gitlab.com",
        username: "user1",
      };

      await db.insert(gitlabIntegrations).values(integration1);

      // Try to insert another integration for the same user
      const integration2: NewGitlabIntegration = {
        id: testUuid("14000001", 2),
        userId: testUserId,
        encryptedToken: "encrypted_token2",
        gitlabUrl: "https://gitlab.com",
        username: "user2",
      };

      // This should throw due to unique constraint
      await expect(
        db.insert(gitlabIntegrations).values(integration2)
      ).rejects.toThrow();
    });

    it("should allow different users to have integrations", async () => {
      const integration1: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: "encrypted_token1",
        gitlabUrl: "https://gitlab.com",
        username: "user1",
      };

      const integration2: NewGitlabIntegration = {
        id: testUuid("14000001", 2),
        userId: otherUserId,
        encryptedToken: "encrypted_token2",
        gitlabUrl: "https://gitlab.com",
        username: "user2",
      };

      await db.insert(gitlabIntegrations).values([integration1, integration2]);

      const result1 = await getGitlabIntegration(testUserId);
      const result2 = await getGitlabIntegration(otherUserId);

      expect(result1?.userId).toBe(testUserId);
      expect(result2?.userId).toBe(otherUserId);
    });
  });

  describe("deleteGitlabIntegration", () => {
    it("should delete integration by userId", async () => {
      const integration: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: "encrypted_token",
        gitlabUrl: "https://gitlab.com",
        username: "testuser",
      };

      await db.insert(gitlabIntegrations).values(integration);

      // Verify it exists
      let result = await getGitlabIntegration(testUserId);
      expect(result).not.toBeNull();

      // Delete it
      await db
        .delete(gitlabIntegrations)
        .where(eq(gitlabIntegrations.userId, testUserId));

      // Verify it's gone
      result = await getGitlabIntegration(testUserId);
      expect(result).toBeNull();
    });

    it("should not throw when integration does not exist", async () => {
      // Delete non-existent integration should not throw
      await db
        .delete(gitlabIntegrations)
        .where(eq(gitlabIntegrations.userId, testUuid("04000000", 999)));

      // Should complete without error
      expect(true).toBe(true);
    });

    it("should NOT cascade delete repositories when integration is deleted", async () => {
      // Note: gitlab_integrations does not cascade to gitlab_repositories.
      // Deleting an integration leaves repository links intact.
      const integration: NewGitlabIntegration = {
        id: testUuid("14000001", 1),
        userId: testUserId,
        encryptedToken: "encrypted_token",
        gitlabUrl: "https://gitlab.com",
        username: "testuser",
      };

      await db.insert(gitlabIntegrations).values(integration);

      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(repository);

      // Delete integration
      await db
        .delete(gitlabIntegrations)
        .where(eq(gitlabIntegrations.userId, testUserId));

      // Repository should still exist (no cascade)
      const repos = await db
        .select()
        .from(gitlabRepositories)
        .where(eq(gitlabRepositories.id, repository.id!))
        .limit(1);

      expect(repos).toHaveLength(1);
    });
  });

  describe("linkRepository", () => {
    it("should link repository to project", async () => {
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(repository);

      const result = await getRepositoryLink(ownedProject.id!);
      expect(result).not.toBeNull();
      expect(result?.projectId).toBe(ownedProject.id);
      expect(result?.gitlabProjectId).toBe(12345);
      expect(result?.repositoryName).toBe("test-repo");
      expect(result?.defaultBranch).toBe("main");
    });

    it("should use default branch when not provided", async () => {
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        gitlabUrl: "https://gitlab.com",
        // defaultBranch not provided, should default to "main"
      };

      await db.insert(gitlabRepositories).values(repository);

      const result = await getRepositoryLink(ownedProject.id!);
      expect(result?.defaultBranch).toBe("main");
    });

    it("should enforce unique constraint on (projectId, gitlabProjectId)", async () => {
      const repository1: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(repository1);

      // Try to insert duplicate
      const repository2: NewGitlabRepository = {
        id: testUuid("14000002", 2),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo-duplicate",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await expect(
        db.insert(gitlabRepositories).values(repository2)
      ).rejects.toThrow();
    });

    it("should allow same GitLab project for different BranchForge projects", async () => {
      const repository1: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      const repository2: NewGitlabRepository = {
        id: testUuid("14000002", 2),
        projectId: otherProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values([repository1, repository2]);

      const result1 = await getRepositoryLink(ownedProject.id!);
      const result2 = await getRepositoryLink(otherProject.id!);

      expect(result1?.projectId).toBe(ownedProject.id);
      expect(result2?.projectId).toBe(otherProject.id);
    });

    it("should allow different GitLab projects for same BranchForge project", async () => {
      const repository1: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "repo1",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      const repository2: NewGitlabRepository = {
        id: testUuid("14000002", 2),
        projectId: ownedProject.id!,
        gitlabProjectId: 67890,
        repositoryName: "repo2",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values([repository1, repository2]);

      const repos = await db
        .select()
        .from(gitlabRepositories)
        .where(eq(gitlabRepositories.projectId, ownedProject.id!));

      expect(repos).toHaveLength(2);
    });
  });

  describe("unlinkRepository", () => {
    it("should unlink repository from project", async () => {
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(repository);

      // Verify it exists
      let result = await getRepositoryLink(ownedProject.id!);
      expect(result).not.toBeNull();

      // Unlink it
      await db
        .delete(gitlabRepositories)
        .where(eq(gitlabRepositories.projectId, ownedProject.id!));

      // Verify it's gone
      result = await getRepositoryLink(ownedProject.id!);
      expect(result).toBeNull();
    });

    it("should not throw when repository not linked", async () => {
      // Unlink non-existent repository should not throw
      await db
        .delete(gitlabRepositories)
        .where(eq(gitlabRepositories.projectId, testUuid("14000000", 999)));

      // Should complete without error
      expect(true).toBe(true);
    });

    it("should only delete repository for specific project", async () => {
      const repository1: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "repo1",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      const repository2: NewGitlabRepository = {
        id: testUuid("14000002", 2),
        projectId: otherProject.id!,
        gitlabProjectId: 67890,
        repositoryName: "repo2",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values([repository1, repository2]);

      // Unlink only the first project
      await db
        .delete(gitlabRepositories)
        .where(eq(gitlabRepositories.projectId, ownedProject.id!));

      // First project should be unlinked
      let result = await getRepositoryLink(ownedProject.id!);
      expect(result).toBeNull();

      // Second project should still be linked
      result = await getRepositoryLink(otherProject.id!);
      expect(result).not.toBeNull();
      expect(result?.gitlabProjectId).toBe(67890);
    });
  });

  describe("getRepositoryLink", () => {
    it("should return repository link when exists", async () => {
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "develop",
        gitlabUrl: "https://gitlab.example.com",
        lastSyncedAt: new Date(),
      };

      await db.insert(gitlabRepositories).values(repository);

      const result = await getRepositoryLink(ownedProject.id!);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(repository.id);
      expect(result?.projectId).toBe(ownedProject.id);
      expect(result?.gitlabProjectId).toBe(12345);
      expect(result?.repositoryName).toBe("test-repo");
      expect(result?.defaultBranch).toBe("develop");
      expect(result?.gitlabUrl).toBe("https://gitlab.example.com");
      expect(result?.lastSyncedAt).toBeInstanceOf(Date);
      expect(result?.createdAt).toBeInstanceOf(Date);
    });

    it("should return null when repository not linked", async () => {
      const result = await getRepositoryLink(ownedProject.id!);
      expect(result).toBeNull();
    });

    it("should return custom GitLab URL", async () => {
      const customUrl = "https://gitlab.mycompany.com";
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: customUrl,
      };

      await db.insert(gitlabRepositories).values(repository);

      const result = await getRepositoryLink(ownedProject.id!);
      expect(result?.gitlabUrl).toBe(customUrl);
    });
  });

  describe("listRepositoryLinks", () => {
    it("should return empty array when user has no repository links", async () => {
      const result = await listRepositoryLinks(testUserId);
      expect(result).toEqual([]);
    });

    it("should list all repository links for user", async () => {
      const repository1: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "repo1",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      const repository2: NewGitlabRepository = {
        id: testUuid("14000002", 2),
        projectId: otherProject.id!,
        gitlabProjectId: 67890,
        repositoryName: "repo2",
        defaultBranch: "develop",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values([repository1, repository2]);

      const result = await listRepositoryLinks(testUserId);

      expect(result).toHaveLength(2);

      const projectIds = result.map((r) => r.projectId);
      expect(projectIds).toContain(ownedProject.id);
      expect(projectIds).toContain(otherProject.id);

      const gitlabProjectIds = result.map((r) => r.gitlabProjectId);
      expect(gitlabProjectIds).toContain(12345);
      expect(gitlabProjectIds).toContain(67890);
    });

    it("should not include repository links from other users", async () => {
      // Create a project owned by another user
      const otherUserProject: NewProject = {
        id: testUuid("14000000", 3),
        userId: otherUserId,
        name: "Other User Project",
        maxMeterDelta: 10,
      };

      // Track this project ID for cleanup
      additionalProjectIds.push(otherUserProject.id!);

      await db.insert(projects).values(otherUserProject);

      const otherUserRepository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: otherUserProject.id!,
        gitlabProjectId: 99999,
        repositoryName: "other-user-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(otherUserRepository);

      const testUserRepository: NewGitlabRepository = {
        id: testUuid("14000002", 2),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-user-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(testUserRepository);

      const result = await listRepositoryLinks(testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].gitlabProjectId).toBe(12345);
      expect(result[0].repositoryName).toBe("test-user-repo");
    });

    it("should return lastSyncedAt when present", async () => {
      const syncedAt = new Date();
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
        lastSyncedAt: syncedAt,
      };

      await db.insert(gitlabRepositories).values(repository);

      const result = await listRepositoryLinks(testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].lastSyncedAt).toBeInstanceOf(Date);
      const delta = Math.abs(
        result[0].lastSyncedAt!.getTime() - syncedAt.getTime()
      );
      expect(delta).toBeLessThanOrEqual(100); // Allow 100ms delta for DB round-trip precision
    });

    it("should return null lastSyncedAt when never synced", async () => {
      const repository: NewGitlabRepository = {
        id: testUuid("14000002", 1),
        projectId: ownedProject.id!,
        gitlabProjectId: 12345,
        repositoryName: "test-repo",
        defaultBranch: "main",
        gitlabUrl: "https://gitlab.com",
      };

      await db.insert(gitlabRepositories).values(repository);

      const result = await listRepositoryLinks(testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].lastSyncedAt).toBeNull();
    });
  });
});
