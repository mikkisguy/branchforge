/**
 * BranchForge Database Schema
 *
 * Complete Drizzle ORM schema for the Visual Novel IDE.
 * Based on Database_Schemas.md specification.
 */

import { pgEnum, pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================

export const projectTypeEnum = pgEnum('project_type', ['PREQUEL', 'SEQUEL']);

export const userRoleEnum = pgEnum('user_role', ['OWNER', 'READER', 'TESTER']);

export const sceneStatusEnum = pgEnum('scene_status', ['DRAFT', 'REVIEW', 'FINAL']);

export const routeTypeEnum = pgEnum('route_type', ['EILEEN', 'LUCAS', 'SHARED', 'FEMALE', 'MALE', 'COMBINED', 'COMMON']);

export const contentTypeEnum = pgEnum('content_type', ['NARRATION', 'DIALOGUE', 'CHOICE', 'MENU', 'JUMP']);

export const visualTypeEnum = pgEnum('visual_type', ['GENERATED', 'BLACK', 'CUSTOM']);

export const elementTypeEnum = pgEnum('element_type', ['LOCATION', 'ITEM', 'CONCEPT', 'EVENT']);

export const suggestionTypeEnum = pgEnum('suggestion_type', ['CONSISTENCY', 'FLAG_SUGGEST', 'METER_SUGGEST', 'DIALOGUE_VARIANT']);

export const suggestionStatusEnum = pgEnum('suggestion_status', ['PENDING', 'ACCEPTED', 'REJECTED']);

export const characterRoleEnum = pgEnum('character_role', ['PRIMARY', 'SECONDARY', 'BACKGROUND', 'MENTIONED']);

export const renpyDefinitionCategoryEnum = pgEnum('renpy_definition_category', ['CHARACTER', 'TRANSFORM', 'IMAGE', 'INIT']);

export const sceneVisibilityEnum = pgEnum('scene_visibility', ['EXCLUSIVE', 'SHARED', 'DUO_PAIR']);

// ============================================================================
// TABLES
// ============================================================================

/**
 * 1. Users
 * Application users including owners and beta readers.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').default('OWNER'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

/**
 * 2. Projects
 * Top-level container for visual novel projects.
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: projectTypeEnum('type').notNull(),
  description: text('description'),
  routeLockChapter: integer('route_lock_chapter'),
  maxMeterDelta: integer('max_meter_delta').default(10),
  visibility: userRoleEnum('visibility').default('OWNER'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('projects_user_id_idx').on(table.userId),
}));

/**
 * 3. Project Users
 * Junction table for beta reader access control.
 */
export const projectUsers = pgTable('project_users', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  pk: index('project_users_pk').on(table.projectId, table.userId),
}));

/**
 * 4. Visual Systems
 * Pattern configuration per project (1:1 with projects).
 */
export const visualSystems = pgTable('visual_systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(), // 'ACT_SCENE_SLUG_COUNTER' or 'CHAPTER_SCENE_SLUG_COUNTER'
  actPrefixes: jsonb('act_prefixes'), // {"I": "ai", "II": "aiii", "III": "aiii"}
  chapterPrefix: text('chapter_prefix'), // "ch"
  scenePadding: integer('scene_padding').notNull(),
  counterPadding: integer('counter_padding').notNull(),
  jumpPrefixShared: text('jump_prefix_shared').notNull(),
  jumpPrefixRouteA: text('jump_prefix_route_a').notNull(),
  jumpPrefixRouteB: text('jump_prefix_route_b').notNull(),
  routeAName: text('route_a_name').notNull(),
  routeBName: text('route_b_name').notNull(),
  placeholderBaseUrl: text('placeholder_base_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('visual_systems_project_id_idx').on(table.projectId),
}));

/**
 * 5. Ren'Py Definitions
 * Character tags, colors, transforms for export.
 */
export const renpyDefinitions = pgTable('renpy_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  category: renpyDefinitionCategoryEnum('category').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  tag: text('tag').notNull(),
  displayName: text('display_name').notNull(),
  definitionCode: text('definition_code').notNull(),
  referenceTag: text('reference_tag'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('renpy_definitions_project_id_idx').on(table.projectId),
}));

/**
 * 6. Characters
 * Character definitions with route affiliations and sprite info.
 */
export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  renpyTag: text('renpy_tag').notNull(),
  routeAffiliation: text('route_affiliation'),
  isLoveInterest: boolean('is_love_interest').default(false).notNull(),
  pairGroupId: uuid('pair_group_id'), // Reference defined below via migration
  dialogueStyle: text('dialogue_style'),
  conditionalPrefix: text('conditional_prefix'),
  color: text('color').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('characters_project_id_idx').on(table.projectId),
  pairGroupIdIdx: index('characters_pair_group_id_idx').on(table.pairGroupId),
}));

/**
 * 7. Pair Groups
 * Sequel duo tracking for shared endings.
 */
export const pairGroups = pgTable('pair_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  characterAId: uuid('character_a_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  characterBId: uuid('character_b_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  duoEndingLabel: text('duo_ending_label').notNull(),
  threshold: integer('threshold').default(70).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('pair_groups_project_id_idx').on(table.projectId),
  characterAIdIdx: index('pair_groups_character_a_id_idx').on(table.characterAId),
  characterBIdIdx: index('pair_groups_character_b_id_idx').on(table.characterBId),
}));

/**
 * 8. Meters
 * Numerical relationship stats (affection, trust, etc.).
 */
export const meters = pgTable('meters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  minValue: integer('min_value').default(0).notNull(),
  maxValue: integer('max_value').default(100).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('meters_project_id_idx').on(table.projectId),
  characterIdIdx: index('meters_character_id_idx').on(table.characterId),
}));

/**
 * 9. Flags
 * Boolean story state tracking.
 */
export const flags = pgTable('flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  description: text('description'),
  category: text('category'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('flags_project_id_idx').on(table.projectId),
}));

/**
 * 10. Scenes
 * Logical scene containers; content stored in scene_lines.
 */
export const scenes = pgTable('scenes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  act: text('act'), // "I", "II", "III" or null
  chapter: integer('chapter'), // 1, 2, 3... or null
  sceneNumber: integer('scene_number').notNull(),
  sequenceOrder: integer('sequence_order').default(0).notNull(),
  route: routeTypeEnum('route'),
  visibility: sceneVisibilityEnum('visibility').default('EXCLUSIVE'),
  duoPairId: uuid('duo_pair_id').references(() => pairGroups.id, { onDelete: 'set null' }),
  status: sceneStatusEnum('status').default('DRAFT'),
  prerequisites: jsonb('prerequisites').notNull().$type<{ flags?: string[]; meters?: Record<string, number> }>(), // {flags: [], meters: {}}
  effects: jsonb('effects').notNull().$type<{ flagsSet?: string[]; flagsUnset?: string[]; meters?: Record<string, number> }>(), // {flagsSet: [], flagsUnset: [], meters: {}}
  crossRouteContext: text('cross_route_context'), // Prequel: "Lucas_Friend_Mode"
  readerNotes: text('reader_notes'), // Beta feedback
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('scenes_project_id_idx').on(table.projectId),
  duoPairIdIdx: index('scenes_duo_pair_id_idx').on(table.duoPairId),
}));

/**
 * 11. Scene Lines
 * Atomic content lines with images and dialogue.
 */
export const sceneLines = pgTable('scene_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  sceneId: uuid('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  content: text('content').notNull(),
  contentType: contentTypeEnum('content_type').notNull(),
  speakerId: uuid('speaker_id').references(() => characters.id, { onDelete: 'set null' }),
  visualType: visualTypeEnum('visual_type').default('GENERATED').notNull(),
  visualSlugOverride: text('visual_slug_override'),
  customVisualName: text('custom_visual_name'),
  menuOptions: jsonb('menu_options').$type<Array<{ label: string; targetSceneId: string; conditionFlags?: string[] }>>(),
  wordCount: integer('word_count'), // Computed on insert/update via trigger
  demoPlaceholderColor: text('demo_placeholder_color'), // Black screen fallback hex
  demoNotes: text('demo_notes'), // "Character enters from left"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sceneIdIdx: index('scene_lines_scene_id_idx').on(table.sceneId),
  speakerIdIdx: index('scene_lines_speaker_id_idx').on(table.speakerId),
}));

/**
 * 12. Scene Characters (Junction)
 * Links scenes to characters with role and emotion state.
 */
export const sceneCharacters = pgTable('scene_characters', {
  sceneId: uuid('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  role: characterRoleEnum('role').default('PRIMARY').notNull(),
  emotion: text('emotion'),
  notes: text('notes'),
}, (table) => ({
  pk: index('scene_characters_pk').on(table.sceneId, table.characterId),
}));

/**
 * 13. World Elements
 * World bible: locations, items, concepts, events.
 */
export const worldElements = pgTable('world_elements', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: elementTypeEnum('type').notNull(),
  description: text('description'),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('world_elements_project_id_idx').on(table.projectId),
}));

/**
 * 14. AI Suggestions
 * AI-generated suggestions with audit trail.
 */
export const aiSuggestions = pgTable('ai_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  suggestionType: suggestionTypeEnum('suggestion_type').notNull(),
  promptContext: jsonb('prompt_context').notNull(), // Anonymized context
  projectNameAnonymized: text('project_name_anonymized'), // Audit trail
  rawResponse: text('raw_response'),
  parsedSuggestions: jsonb('parsed_suggestions').notNull().$type<any[]>(), // Array of suggestions
  status: suggestionStatusEnum('status').default('PENDING'),
  appliedAt: timestamp('applied_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('ai_suggestions_project_id_idx').on(table.projectId),
  sceneIdIdx: index('ai_suggestions_scene_id_idx').on(table.sceneId),
  characterIdIdx: index('ai_suggestions_character_id_idx').on(table.characterId),
}));

/**
 * 15. Exports
 * Generated export files tracking.
 */
export const exports = pgTable('exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  format: text('format').notNull(), // 'RENPY', 'MARKDOWN', 'JSON'
  fileName: text('file_name').notNull(),
  content: text('content'), // Generated .rpy content
  fileSize: integer('file_size'),
  visualSystemSnapshot: jsonb('visual_system_snapshot'), // Version of pattern used
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('exports_project_id_idx').on(table.projectId),
}));

/**
 * 16. Import Logs
 * One-time migration tracking (e.g., from Google Docs).
 */
export const importLogs = pgTable('import_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // "google_docs"
  sourceUrl: text('source_url'), // Original doc reference
  scenesCreated: integer('scenes_created').notNull().default(0),
  scenesSkipped: integer('scenes_skipped').notNull().default(0), // Duplicates/conflicts
  errors: jsonb('errors').$type<Array<{ message: string; line?: number }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('import_logs_project_id_idx').on(table.projectId),
}));

/**
 * 17. Demo Sessions
 * Playback sessions for beta readers and testing.
 */
export const demoSessions = pgTable('demo_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  currentSceneLineId: uuid('current_scene_line_id').references(() => sceneLines.id, { onDelete: 'set null' }),
  activeFlags: jsonb('active_flags').notNull().$type<string[]>().default([]),
  activeMeters: jsonb('active_meters').notNull().$type<Record<string, number>>().default({}),
  routeTaken: text('route_taken'),
  endedAt: timestamp('ended_at'),
}, (table) => ({
  projectIdIdx: index('demo_sessions_project_id_idx').on(table.projectId),
  userIdIdx: index('demo_sessions_user_id_idx').on(table.userId),
  currentSceneLineIdIdx: index('demo_sessions_current_scene_line_id_idx').on(table.currentSceneLineId),
}));

// ============================================================================
// TYPES
// ============================================================================

// User types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Project types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// Project User types
export type ProjectUser = typeof projectUsers.$inferSelect;
export type NewProjectUser = typeof projectUsers.$inferInsert;

// Visual System types
export type VisualSystem = typeof visualSystems.$inferSelect;
export type NewVisualSystem = typeof visualSystems.$inferInsert;

// Ren'Py Definition types
export type RenpyDefinition = typeof renpyDefinitions.$inferSelect;
export type NewRenpyDefinition = typeof renpyDefinitions.$inferInsert;

// Character types
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;

// Pair Group types
export type PairGroup = typeof pairGroups.$inferSelect;
export type NewPairGroup = typeof pairGroups.$inferInsert;

// Meter types
export type Meter = typeof meters.$inferSelect;
export type NewMeter = typeof meters.$inferInsert;

// Flag types
export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;

// Scene types
export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;

// Scene Line types
export type SceneLine = typeof sceneLines.$inferSelect;
export type NewSceneLine = typeof sceneLines.$inferInsert;

// Scene Character types
export type SceneCharacter = typeof sceneCharacters.$inferSelect;
export type NewSceneCharacter = typeof sceneCharacters.$inferInsert;

// World Element types
export type WorldElement = typeof worldElements.$inferSelect;
export type NewWorldElement = typeof worldElements.$inferInsert;

// AI Suggestion types
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;

// Export types
export type Export = typeof exports.$inferSelect;
export type NewExport = typeof exports.$inferInsert;

// Import Log types
export type ImportLog = typeof importLogs.$inferSelect;
export type NewImportLog = typeof importLogs.$inferInsert;

// Demo Session types
export type DemoSession = typeof demoSessions.$inferSelect;
export type NewDemoSession = typeof demoSessions.$inferInsert;
