#!/usr/bin/env node

/**
 * Reset Technical Badges Test Data
 *
 * Removes the test user and all associated data created by the seed script.
 */

import { getDb } from "../src/db/index.js";
import {
  users,
  projects,
  labels,
  labelLines,
  characters,
  projectFiles,
} from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

const TEST_EMAIL = "tech-badges-test@example.com";

async function resetTechnicalBadgesData() {
  const db = getDb();

  console.log("🗑️  Resetting technical badges test data...\n");

  // Find test user
  const [testUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_EMAIL))
    .limit(1);

  if (!testUser) {
    console.log("✅ No test user found - nothing to reset");
    process.exit(0);
  }

  // Get test project
  const [testProject] = await db
    .select()
    .from(projects)
    .where(eq(projects.name, "Technical Badges Test"))
    .limit(1);

  if (testProject) {
    console.log(`🗑️  Deleting project: ${testProject.name}`);

    // Delete label lines
    const [testLabel] = await db
      .select()
      .from(labels)
      .where(eq(labels.title, "tech_badges_test"))
      .limit(1);

    if (testLabel) {
      await db.delete(labelLines).where(eq(labelLines.labelId, testLabel.id));
      await db.delete(labels).where(eq(labels.id, testLabel.id));
      console.log("  ✅ Deleted label and lines");
    }

    // Delete characters
    await db.delete(characters).where(eq(characters.projectId, testProject.id));
    console.log("  ✅ Deleted characters");

    // Delete project files
    await db
      .delete(projectFiles)
      .where(eq(projectFiles.projectId, testProject.id));
    console.log("  ✅ Deleted project files");

    // Delete project
    await db.delete(projects).where(eq(projects.id, testProject.id));
    console.log("  ✅ Deleted project");
  }

  // Delete user
  await db.delete(users).where(eq(users.id, testUser.id));
  console.log("  ✅ Deleted test user");

  console.log("\n🎉 Technical badges test data reset successfully!");
  process.exit(0);
}

// Run the reset script
resetTechnicalBadgesData().catch((error) => {
  console.error("❌ Reset script failed:", error);
  process.exit(1);
});
