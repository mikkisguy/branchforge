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
  routeConfigs,
  type NewLabelLine,
} from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { calculateContentHash } from "../src/lib/hash.js";
import { hashPassword } from "../src/services/auth.service.js";
import type { IncomingJump } from "@branchforge/shared";

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
    .orderBy(projectFiles.filePath)
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

  // Create route config for outgoing jump display
  const TEST_ROUTE_KEY = "tech_test";
  const [existingRouteConfig] = await db
    .select()
    .from(routeConfigs)
    .where(
      and(
        eq(routeConfigs.projectId, testProject.id),
        eq(routeConfigs.routeKey, TEST_ROUTE_KEY)
      )
    )
    .limit(1);

  if (!existingRouteConfig) {
    await db.insert(routeConfigs).values({
      projectId: testProject.id,
      routeKey: TEST_ROUTE_KEY,
      routeName: "Tech Test Route",
      jumpPrefix: "tech_test_",
      sortOrder: 0,
      isShared: false,
    });
    console.log(`✅ Created route config: ${TEST_ROUTE_KEY}`);
  } else {
    console.log(`✅ Using existing route config: ${TEST_ROUTE_KEY}`);
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
      route: TEST_ROUTE_KEY,
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

  // Create target labels for menu choices and jumps
  const targetLabels = [
    { name: "Fight Scene", labelName: "label_fight" },
    { name: "Run Away Scene", labelName: "label_run" },
    { name: "Talk Scene", labelName: "label_talk" },
    { name: "Light Path", labelName: "label_light" },
    { name: "Dark Path", labelName: "label_dark" },
    { name: "Gold Scene", labelName: "label_gold" },
    { name: "Gem Scene", labelName: "label_gem" },
    { name: "Nothing Scene", labelName: "label_nothing" },
    { name: "Chapter Two Scene One", labelName: "chapter_two_scene_one" },
  ];

  const createdTargetLabels: Array<{ id: string; labelName: string }> = [];
  for (const target of targetLabels) {
    const [targetLabel] = await db
      .insert(labels)
      .values({
        projectId: testProject.id,
        projectFileId: projectFileId!,
        title: target.name,
        labelName: target.labelName,
        labelNumber: createdTargetLabels.length + 2,
        sequenceOrder: createdTargetLabels.length + 1,
        visibility: "EXCLUSIVE",
        status: "DRAFT",
        conditions: {},
        effects: {},
        createdBy: testUser.id,
        updatedBy: testUser.id,
      })
      .returning({ id: labels.id, labelName: labels.labelName });
    createdTargetLabels.push({
      id: targetLabel.id,
      labelName: targetLabel.labelName!,
    });
    console.log(
      `✅ Created target label: ${target.name} (${target.labelName})`
    );
  }
  console.log();

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
          targetLabelName: "label_fight",
          effects: {
            stats: {
              bravery: 10,
            },
          },
        },
        {
          label: "Run away",
          targetLabelId: "label_run",
          targetLabelName: "label_run",
          conditionFlags: ["has_stamina"],
          effects: {
            stats: {
              stamina: -5,
              cowardice: 3,
            },
          },
        },
        {
          label: "Talk",
          targetLabelId: "label_talk",
          targetLabelName: "label_talk",
          effects: {
            stats: {
              charisma: 5,
              trust: 8,
            },
          },
        },
      ],
    },

    // Line 3: Conditions with different comparison operators and variable conditions
    {
      labelId,
      sequence: 3,
      content: "The door is locked.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "BLACK",
      conditions: {
        stats: {
          strength: { value: 5, operator: ">=" },
          charisma: { value: 3, operator: "<=" },
          intelligence: { value: 10, operator: ">" },
          luck: { value: 2, operator: "<" },
        },
        variables: {
          has_key: { value: true, operator: "truthy" },
          is_daytime: { value: true, operator: "truthy" },
        },
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
          targetLabelName: "label_light",
          effects: {
            stats: {
              light: 5,
              darkness: -3,
            },
          },
        },
        {
          label: "Dark path",
          targetLabelId: "label_dark",
          targetLabelName: "label_dark",
          effects: {
            stats: {
              darkness: 8,
              suspicion: 2,
            },
          },
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

    // Line 8: Multiple conditions with all variable condition types
    {
      labelId,
      sequence: 8,
      content: "The chest glows with magical energy.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "GENERATED",
      conditions: {
        stats: {
          magic: { value: 10, operator: ">=" },
          luck: { value: 5, operator: "==" },
          gold: { value: 100, operator: "!=" },
        },
        variables: {
          // Truthy: bare identifier check (if has_spell:)
          has_spell: { value: true, operator: "truthy" },
          // Falsy: negation check (if not is_main_quest:)
          is_main_quest: { value: true, operator: "falsy" },
          // String equality: (if alignment == "good":)
          alignment: { value: "good", operator: "==" },
          // String inequality: (if faction != "evil":)
          faction: { value: "evil", operator: "!=" },
          // Boolean equality: (if has_drink == True:)
          has_drink: { value: true, operator: "==" },
          // Boolean inequality: (if is_cursed != False:)
          is_cursed: { value: false, operator: "!=" },
        },
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
          targetLabelName: "label_gold",
          effects: {
            stats: {
              gold: -50,
              trust: 3,
            },
          },
        },
        {
          label: "Magic gem",
          targetLabelId: "label_gem",
          targetLabelName: "label_gem",
          conditionFlags: ["has_gem"],
          effects: {
            stats: {
              magic: 10,
              greed: -5,
            },
          },
        },
        {
          label: "Nothing",
          targetLabelId: "label_nothing",
          targetLabelName: "label_nothing",
          effects: {
            stats: {
              trust: -5,
              anger: 7,
            },
          },
        },
      ],
    },

    // Line 10: All comparison operators in one place
    {
      labelId,
      sequence: 10,
      content: "Testing all comparison operators.",
      contentType: "NARRATION",
      speakerId: null,
      visualType: "GENERATED",
      conditions: {
        stats: {
          strength: { value: 10, operator: ">=" },
          dexterity: { value: 5, operator: "<=" },
          intelligence: { value: 15, operator: ">" },
          wisdom: { value: 3, operator: "<" },
          charisma: { value: 8, operator: "==" },
          luck: { value: 0, operator: "!=" },
        },
      },
    },

    // Line 11: Menu with multiple stat effects per choice
    {
      labelId,
      sequence: 11,
      content: "Who will you ally with?",
      contentType: "DIALOGUE",
      speakerId: characterId,
      visualType: "GENERATED",
      menuOptions: [
        {
          label: "The Kingdom",
          targetLabelId: "label_fight",
          targetLabelName: "label_fight",
          effects: {
            stats: {
              honor: 15,
              kingdom_reputation: 20,
              rebel_loyalty: -10,
            },
          },
        },
        {
          label: "The Rebels",
          targetLabelId: "label_run",
          targetLabelName: "label_run",
          effects: {
            stats: {
              honor: -10,
              kingdom_reputation: -15,
              rebel_loyalty: 25,
              freedom: 10,
            },
          },
        },
        {
          label: "Stay Neutral",
          targetLabelId: "label_talk",
          targetLabelName: "label_talk",
          effects: {
            stats: {
              caution: 8,
              wisdom: 5,
            },
          },
        },
      ],
    },

    // Line 12: Menu with mixed positive and negative effects
    {
      labelId,
      sequence: 12,
      content: "What's your strategy?",
      contentType: "DIALOGUE",
      speakerId: characterId,
      visualType: "GENERATED",
      menuOptions: [
        {
          label: "Aggressive approach",
          targetLabelId: "label_gold",
          targetLabelName: "label_gold",
          effects: {
            stats: {
              damage: 20,
              stealth: -15,
              health_risk: 10,
            },
          },
        },
        {
          label: "Stealthy approach",
          targetLabelId: "label_gem",
          targetLabelName: "label_gem",
          effects: {
            stats: {
              stealth: 25,
              reputation: 5,
              damage: -5,
            },
          },
        },
        {
          label: "Diplomatic approach",
          targetLabelId: "label_nothing",
          targetLabelName: "label_nothing",
          effects: {
            stats: {
              charisma: 15,
              reputation: 10,
              intimidation: -10,
            },
          },
        },
      ],
    },
  ];

  await db.insert(labelLines).values(testLines);
  console.log(`✅ Created ${testLines.length} test lines\n`);

  // Build incoming jumps for target labels
  const targetLabelMap = new Map(
    createdTargetLabels.map((l) => [l.labelName, l.id])
  );

  const incomingJumpsByTarget: Record<string, IncomingJump[]> = {
    label_fight: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Fight",
      },
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "The Kingdom",
      },
    ],
    label_run: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Run away",
        conditions: {
          variables: {
            has_stamina: { value: true, operator: "truthy" },
          },
        },
      },
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "The Rebels",
      },
    ],
    label_talk: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Talk",
      },
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Stay Neutral",
      },
    ],
    label_light: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Light path",
      },
    ],
    label_dark: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Dark path",
      },
    ],
    label_gold: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Gold coins",
      },
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Aggressive approach",
      },
    ],
    label_gem: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Magic gem",
        conditions: {
          variables: {
            has_gem: { value: true, operator: "truthy" },
          },
        },
      },
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Stealthy approach",
      },
    ],
    label_nothing: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Nothing",
      },
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "MENU_CHOICE",
        choiceText: "Diplomatic approach",
      },
    ],
    chapter_two_scene_one: [
      {
        sourceLabelId: labelId,
        sourceLabelTitle: TEST_LABEL_TITLE,
        sourceLabelName: TEST_LABEL_TITLE,
        jumpType: "AUTOMATIC",
        choiceText: "Automatic jump",
      },
      ...createdTargetLabels
        .filter((l) =>
          ["label_gold", "label_gem", "label_nothing"].includes(l.labelName)
        )
        .map((l) => ({
          sourceLabelId: l.id,
          sourceLabelTitle: targetLabels.find(
            (t) => t.labelName === l.labelName
          )!.name,
          sourceLabelName: l.labelName,
          jumpType: "AUTOMATIC" as const,
          choiceText: "Automatic jump" as const,
        })),
    ],
  };

  for (const [labelName, jumps] of Object.entries(incomingJumpsByTarget)) {
    const targetId = targetLabelMap.get(labelName);
    if (targetId) {
      await db
        .update(labels)
        .set({ incomingJumps: jumps })
        .where(eq(labels.id, targetId));
      console.log(`✅ Added ${jumps.length} incoming jump(s) to ${labelName}`);
    }
  }
  console.log();

  // Summary
  console.log("🎉 Technical badges test data seeded successfully!\n");
  console.log("Test features included:");
  console.log(
    "  ✅ Menu options (choices with condition flags and resolved target IDs)"
  );
  console.log(
    "  ✅ Conditions with all comparison operators (>=, <=, >, <, ==, !=)"
  );
  console.log(
    "  ✅ Variable conditions (truthy, falsy, ==, != with string and boolean values)"
  );
  console.log("  ✅ Visual statements (SCENE, SHOW, HIDE)");
  console.log("  ✅ Jump targets");
  console.log("  ✅ Incoming jumps on target labels");
  console.log("  ✅ Outgoing jump (route-based prefix via route config)");
  console.log("  ✅ Combinations of multiple features");
  console.log(
    `  ✅ ${createdTargetLabels.length} target labels created for testing resolution\n`
  );
  console.log("To test comparison operators and variable conditions:");
  console.log(`  1. Open the app and login with: ${TEST_EMAIL}`);
  console.log(`  2. Password: ${TEST_PASSWORD}`);
  console.log("  3. Open the 'Technical Badges Test' project");
  console.log("  4. Navigate to the 'tech_badges_test' label");
  console.log(
    "  5. Click the eye icon in the top-right to toggle technical badges"
  );
  console.log(
    "  6. Click/hover on badges on lines 3, 8, and 10 to see operator symbols"
  );
  console.log("  7. Verify symbols: ≥, ≤, =, ≠ are displayed correctly");
  console.log("  8. Line 8 showcases all variable condition types:");
  console.log("     - truthy: has_spell (displayed as just the name)");
  console.log("     - falsy: ¬is_main_quest (displayed with ¬ prefix)");
  console.log("     - ==: alignment = good, has_drink = True");
  console.log("     - !=: faction ≠ evil, is_cursed ≠ False");
  console.log("\n  9. Navigate to lines with menu options (lines 2, 6, 9)");
  console.log(
    " 10. Hover over the choice badges to see resolved target label IDs"
  );
  console.log(
    " 11. Verify that targetLabelId is populated with actual database IDs"
  );

  process.exit(0);
}

// Run the seed script
seedTechnicalBadgesData().catch((error) => {
  console.error("❌ Seed script failed:", error);
  process.exit(1);
});
