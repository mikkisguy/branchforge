#!/usr/bin/env node

/**
 * Seed Technical Badge Test Data
 *
 * Creates label lines with various technical features to test the badge system:
 * - Menu options (choices)
 * - Conditions (stats/variables)
 * - Visual statements (scene/show/hide)
 * - Jump targets
 */

import { getDb } from "../src/db/index.js";
import {
  users,
  projects,
  projectFiles,
  labels,
  labelLines,
  characters,
  type NewLabelLine,
} from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";
import { calculateContentHash } from "../src/lib/hash.js";
import { hashPassword } from "../src/services/auth.service.js";

const TEST_EMAIL = "tech-badges-test@example.com";
const TEST_PASSWORD = "testpassword123";
const TEST_PROJECT_NAME = "Technical Badges Test";
const TEST_LABEL_TITLE = "tech_badges_test";

async function seedTechnicalBadgesData() {
  const db = getDb();

  console.log("🌱 Seeding technical badge test data...\n");

  // Check if test user exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_EMAIL))
    .limit(1);

  if (existingUser.length === 0) {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await db.insert(users).values({
      email: TEST_EMAIL,
      passwordHash,
      role: "OWNER",
    });
    console.log(`✅ Created test user: ${TEST_EMAIL}`);
  } else {
    console.log(`✅ Using existing test user: ${TEST_EMAIL}`);
  }

  const [testUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_EMAIL))
    .limit(1);

  // Check if test project exists
  const existingProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.name, TEST_PROJECT_NAME))
    .limit(1);

  if (existingProjects.length === 0) {
    await db.insert(projects).values({
      userId: testUser.id,
      name: TEST_PROJECT_NAME,
      description: "Test project for technical badges feature",
      maxStatDelta: 10,
      source: "ZIP",
    });
    console.log(`✅ Created test project: ${TEST_PROJECT_NAME}`);
  } else {
    console.log(`✅ Using existing test project: ${TEST_PROJECT_NAME}`);
  }

  const [testProject] = await db
    .select()
    .from(projects)
    .where(eq(projects.name, TEST_PROJECT_NAME))
    .limit(1);

  // Create a character for dialogue lines
  const existingCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, testProject.id))
    .limit(1);

  let characterId: string | null;
  if (existingCharacters.length === 0) {
    const [newCharacter] = await db
      .insert(characters)
      .values({
        projectId: testProject.id,
        name: "Test Character",
        displayName: "Testy",
        renpyTag: "test",
        color: "#FF5733",
      })
      .returning({ id: characters.id });
    characterId = newCharacter.id;
    console.log("✅ Created test character");
  } else {
    characterId = existingCharacters[0].id;
    console.log("✅ Using existing test character");
  }

  // Create project file
  const existingFiles = await db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, testProject.id))
    .limit(1);

  let projectFileId: string | null;
  if (existingFiles.length === 0) {
    const [newFile] = await db
      .insert(projectFiles)
      .values({
        projectId: testProject.id,
        source: "ZIP",
        filePath: "test/tech-badges.rpy",
        fileType: "STORY",
        content: 'label start:\n    "Test"',
        contentHash: calculateContentHash('label start:\n    "Test"'),
      })
      .returning({ id: projectFiles.id });
    projectFileId = newFile.id;
    console.log("✅ Created test project file");
  } else {
    projectFileId = existingFiles[0].id;
    console.log("✅ Using existing test project file");
  }

  // Clean up existing test label
  const [existingLabel] = await db
    .select()
    .from(labels)
    .where(eq(labels.title, TEST_LABEL_TITLE))
    .limit(1);

  if (existingLabel) {
    await db.delete(labelLines).where(eq(labelLines.labelId, existingLabel.id));
    await db.delete(labels).where(eq(labels.id, existingLabel.id));
    console.log("🗑️  Cleaned up existing test label");
  }

  // Create test label
  const [newLabel] = await db
    .insert(labels)
    .values({
      projectId: testProject.id,
      projectFileId: projectFileId!,
      title: TEST_LABEL_TITLE,
      labelNumber: 1,
      sequenceOrder: 0,
      visibility: "EXCLUSIVE",
      status: "DRAFT",
      conditions: {},
      effects: {},
      createdBy: testUser.id,
      updatedBy: testUser.id,
    })
    .returning({ id: labels.id });

  const labelId = newLabel.id;
  console.log(`✅ Created test label: ${labelId}\n`);

  // Create label lines with various technical features
  const testLines: NewLabelLine[] = [
    // Line 1: Simple dialogue (no technical info)
    {
      labelId,
      sequence: 1,
      content: "This is a simple dialogue line with no technical features.",
      contentType: "DIALOGUE",
      speakerId: characterId,
      visualType: "GENERATED",
    },

    // Line 2: Menu options (choices)
    {
      labelId,
      sequence: 2,
      content: "What do you want to do?",
      contentType: "DIALOGUE",
      speakerId: characterId,
      visualType: "GENERATED",
      menuOptions: [
        {
          label: "Fight",
          targetLabelId: "label_fight",
        },
        {
          label: "Run away",
          targetLabelId: "label_run",
          conditionFlags: ["has_stamina"],
        },
        {
          label: "Talk",
          targetLabelId: "label_talk",
        },
      ],
    },

    // Line 3: Conditions (stats and variables)
    {
      labelId,
      sequence: 3,
      content: "The door is locked.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "BLACK",
      conditions: {
        stats: {
          strength: 5,
          charisma: 3,
        },
        variables: ["has_key", "is_daytime"],
      },
    },

    // Line 4: Visual statements
    {
      labelId,
      sequence: 4,
      content: "Enter the main hall.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "GENERATED",
      visualStatements: [
        {
          type: "SCENE",
          target: "bg hall",
        },
        {
          type: "SHOW",
          target: "eileen",
          at: "center",
          with: "fade",
          zorder: 1,
        },
        {
          type: "SHOW",
          target: "ben",
          at: "left",
        },
      ],
    },

    // Line 5: Jump target
    {
      labelId,
      sequence: 5,
      content: "jump chapter_two_scene_one",
      contentType: "JUMP",
      speakerId: null,
      visualType: "GENERATED",
    },

    // Line 6: Combination - menu + conditions + visuals
    {
      labelId,
      sequence: 6,
      content: "Choose your path carefully...",
      contentType: "DIALOGUE",
      speakerId: characterId,
      visualType: "GENERATED",
      menuOptions: [
        {
          label: "Light path",
          targetLabelId: "label_light",
        },
        {
          label: "Dark path",
          targetLabelId: "label_dark",
        },
      ],
      conditions: {
        stats: {
          courage: 8,
        },
      },
      visualStatements: [
        {
          type: "SCENE",
          target: "bg forest_crossroads",
        },
      ],
    },

    // Line 7: Hide visual statement
    {
      labelId,
      sequence: 7,
      content: "Eileen leaves the room.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "GENERATED",
      visualStatements: [
        {
          type: "HIDE",
          target: "eileen",
        },
      ],
    },

    // Line 8: Multiple conditions with different types
    {
      labelId,
      sequence: 8,
      content: "The chest glows with magical energy.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "GENERATED",
      conditions: {
        stats: {
          magic: 10,
          luck: 5,
          gold: 100,
        },
        variables: ["has_spell", "is_main_quest"],
      },
    },

    // Line 9: Complex menu with condition flags
    {
      labelId,
      sequence: 9,
      content: "What will you give me?",
      contentType: "DIALOGUE",
      speakerId: characterId,
      visualType: "GENERATED",
      menuOptions: [
        {
          label: "Gold coins",
          targetLabelId: "label_gold",
        },
        {
          label: "Magic gem",
          targetLabelId: "label_gem",
          conditionFlags: ["has_gem"],
        },
        {
          label: "Nothing",
          targetLabelId: "label_nothing",
        },
      ],
    },
  ];

  await db.insert(labelLines).values(testLines);
  console.log(`✅ Created ${testLines.length} test lines\n`);

  // Summary
  console.log("🎉 Technical badges test data seeded successfully!\n");
  console.log("Test features included:");
  console.log("  ✅ Menu options (choices with condition flags)");
  console.log("  ✅ Conditions (stats and variables)");
  console.log("  ✅ Visual statements (SCENE, SHOW, HIDE)");
  console.log("  ✅ Jump targets");
  console.log("  ✅ Combinations of multiple features\n");
  console.log("To test:");
  console.log(`  1. Open the app and login with: ${TEST_EMAIL}`);
  console.log(`  2. Password: ${TEST_PASSWORD}`);
  console.log("  3. Open the 'Technical Badges Test' project");
  console.log("  4. Navigate to the 'tech_badges_test' label");
  console.log(
    "  5. Click the eye icon in the top-right to toggle technical badges"
  );
  console.log(
    "  6. You should see badges on lines 2-9 (line 1 has no badges)\n"
  );

  process.exit(0);
}

// Run the seed script
seedTechnicalBadgesData().catch((error) => {
  console.error("❌ Seed script failed:", error);
  process.exit(1);
});
