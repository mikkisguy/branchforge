/**
 * Drizzle ORM Enums
 *
 * All PostgreSQL enum type definitions for the BranchForge database.
 */

import { pgEnum } from 'drizzle-orm/pg-core';

// Project types
export const projectTypeEnum = pgEnum('project_type', ['PREQUEL', 'SEQUEL']);

// User roles (owner, beta reader, tester)
export const userRoleEnum = pgEnum('user_role', ['OWNER', 'READER', 'TESTER']);

// Scene workflow status
export const sceneStatusEnum = pgEnum('scene_status', ['DRAFT', 'REVIEW', 'FINAL']);

// Route types for prequel and sequel
export const routeTypeEnum = pgEnum('route_type', ['EILEEN', 'LUCAS', 'SHARED', 'FEMALE', 'MALE', 'COMBINED', 'COMMON']);

// Content line types for export logic
export const contentTypeEnum = pgEnum('content_type', ['NARRATION', 'DIALOGUE', 'CHOICE', 'MENU', 'JUMP']);

// Visual/image handling types
export const visualTypeEnum = pgEnum('visual_type', ['GENERATED', 'BLACK', 'CUSTOM']);

// World bible element types
export const elementTypeEnum = pgEnum('element_type', ['LOCATION', 'ITEM', 'CONCEPT', 'EVENT']);

// AI suggestion types
export const suggestionTypeEnum = pgEnum('suggestion_type', ['CONSISTENCY', 'FLAG_SUGGEST', 'METER_SUGGEST', 'DIALOGUE_VARIANT']);

// AI suggestion workflow status
export const suggestionStatusEnum = pgEnum('suggestion_status', ['PENDING', 'ACCEPTED', 'REJECTED']);

// Character role in a scene
export const characterRoleEnum = pgEnum('character_role', ['PRIMARY', 'SECONDARY', 'BACKGROUND', 'MENTIONED']);

// Ren'Py definition categories
export const renpyDefinitionCategoryEnum = pgEnum('renpy_definition_category', ['CHARACTER', 'TRANSFORM', 'IMAGE', 'INIT']);

// Scene visibility types
export const sceneVisibilityEnum = pgEnum('scene_visibility', ['EXCLUSIVE', 'SHARED', 'DUO_PAIR']);

// GitLab sync operation types
export const syncOperationEnum = pgEnum('sync_operation', ['export', 'import']);

// GitLab sync status types
export const syncStatusEnum = pgEnum('sync_status', ['pending', 'in_progress', 'completed', 'failed']);

// GitLab file types
export const gitlabFileTypeEnum = pgEnum('gitlab_file_type', ['STORY', 'SETTINGS']);

// GitLab file sync state types
export const syncStateEnum = pgEnum('sync_state', ['pending', 'in_progress', 'completed', 'failed']);
