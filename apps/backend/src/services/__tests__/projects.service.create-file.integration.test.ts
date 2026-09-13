/**
 * createProjectFile integration tests
 */

import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { getDb } from "../../db/index.js";
import {
  users,
  projects,
  projectFiles,
  labels,
  type NewUser,
  type NewProject,
} from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { createProjectFile } from "../projects.service.js";
import { createLabel } from "../labels.service.js";
import { testEmail, testUuid } from "../../utils/test-ids.js";
import { calculateContentHash } from "../../lib/hash.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../middleware/error-handler.middleware.js";

describe("createProjectFile (Integration)", () => {
  let db: ReturnType<typeof getDb>;

  const testUserId = testUuid("04000000", 1);
  const otherUserId = testUuid("04000000", 2);

  const testUser: NewUser = {
    id: testUserId,
    email: testEmail("create-project-file", "owner"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const otherUser: NewUser = {
    id: otherUserId,
    email: testEmail("create-project-file", "other"),
    passwordHash: "hashed_password",
    role: "OWNER",
  };

  const zipProject: NewProject = {
    id: testUuid("14000000", 1),
    userId: testUserId,
    name: "ZIP Project",
    source: "ZIP",
  };

  const gitlabProject: NewProject = {
    id: testUuid("14000000", 2),
    userId: testUserId,
    name: "GitLab Project",
    source: "GITLAB",
  };

  async function cleanupTestData() {
    const projectIds = [zipProject.id!, gitlabProject.id!];

    await db.delete(labels).where(inArray(labels.projectId, projectIds));
    await db
      .delete(projectFiles)
      .where(inArray(projectFiles.projectId, projectIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
    await db.delete(users).where(inArray(users.id, [testUserId, otherUserId]));
  }

  async function setupTestData() {
    await db.insert(users).values([testUser, otherUser]);
    await db.insert(projects).values([zipProject, gitlabProject]);
  }

  beforeAll(async () => {
    db = getDb();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("stores canonicalized empty STORY files using the project source", async () => {
    const zipFile = await createProjectFile(
      zipProject.id!,
      testUserId,
      "labels/./ActOne"
    );
    const gitlabFile = await createProjectFile(
      gitlabProject.id!,
      testUserId,
      "labels/ActTwo.rpy"
    );

    expect(zipFile).toMatchObject({
      projectId: zipProject.id,
      filePath: "labels/ActOne.rpy",
      fileType: "STORY",
      content: "",
      originalContent: null,
      contentHash: calculateContentHash(""),
      source: "ZIP",
      labels: [],
    });
    expect(gitlabFile.source).toBe("GITLAB");
  });

  it("rejects unsafe and reserved paths", async () => {
    await expect(
      createProjectFile(zipProject.id!, testUserId, "../escape.rpy")
    ).rejects.toThrow(ValidationError);

    await expect(
      createProjectFile(zipProject.id!, testUserId, "branchforge_variables.rpy")
    ).rejects.toThrow(ValidationError);
  });

  it("rejects duplicate paths case-insensitively", async () => {
    await createProjectFile(zipProject.id!, testUserId, "labels/story.rpy");

    await expect(
      createProjectFile(zipProject.id!, testUserId, "labels/Story.rpy")
    ).rejects.toThrow(ConflictError);
  });

  it("rejects an opposite-source case variant already stored for the project", async () => {
    await db.insert(projectFiles).values({
      projectId: zipProject.id!,
      source: "GITLAB",
      filePath: "labels/Imported.rpy",
      fileType: "STORY",
      content: "",
      contentHash: calculateContentHash(""),
    });

    await expect(
      createProjectFile(zipProject.id!, testUserId, "labels/imported.rpy")
    ).rejects.toThrow(ConflictError);
  });

  it("serializes concurrent creates so only one row is stored", async () => {
    const results = await Promise.allSettled([
      createProjectFile(zipProject.id!, testUserId, "labels/race.rpy"),
      createProjectFile(zipProject.id!, testUserId, "labels/Race.rpy"),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: expect.any(ConflictError),
    });

    const stored = await db
      .select({ filePath: projectFiles.filePath })
      .from(projectFiles)
      .where(eq(projectFiles.projectId, zipProject.id!));

    expect(stored).toHaveLength(1);
    expect(stored[0]?.filePath.toLowerCase()).toBe("labels/race.rpy");
  });

  it("requires project ownership", async () => {
    await expect(
      createProjectFile(zipProject.id!, otherUserId, "labels/forbidden.rpy")
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError for missing projects", async () => {
    await expect(
      createProjectFile(
        testUuid("14999999", 1),
        testUserId,
        "labels/missing.rpy"
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("allows createLabel on a newly created file", async () => {
    const createdFile = await createProjectFile(
      zipProject.id!,
      testUserId,
      "labels/new_scene.rpy"
    );

    const label = await createLabel(testUserId, {
      projectId: zipProject.id!,
      title: "Opening Scene",
      labelNumber: 1,
      projectFileId: createdFile.id,
    });

    expect(label.projectFileId).toBe(createdFile.id);
    expect(label.fileName).toBe("new_scene.rpy");

    const [storedLabel] = await db
      .select({ projectFileId: labels.projectFileId, title: labels.title })
      .from(labels)
      .where(eq(labels.id, label.id))
      .limit(1);

    expect(storedLabel).toMatchObject({
      projectFileId: createdFile.id,
      title: "Opening Scene",
    });
  });
});
