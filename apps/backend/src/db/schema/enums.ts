/**
 * Drizzle ORM Enums
 *
 * All PostgreSQL enum type definitions for the BranchForge database.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// User roles (owner, beta reader, tester)
export const userRoleEnum = pgEnum("user_role", ["OWNER", "READER", "TESTER"]);

// Label workflow status
export const labelStatusEnum = pgEnum("label_status", [
  "DRAFT",
  "REVIEW",
  "FINAL",
]);

// Content line types for export logic
export const contentTypeEnum = pgEnum("content_type", [
  "NARRATION",
  "DIALOGUE",
  "CHOICE",
  "MENU",
  "JUMP",
]);

// Visual/image handling types
export const visualTypeEnum = pgEnum("visual_type", [
  "GENERATED",
  "BLACK",
  "CUSTOM",
]);

// World bible element types
export const elementTypeEnum = pgEnum("element_type", [
  "LOCATION",
  "ITEM",
  "CONCEPT",
  "EVENT",
]);

// AI suggestion types
export const suggestionTypeEnum = pgEnum("suggestion_type", [
  "CONSISTENCY",
  "FLAG_SUGGEST",
  "METER_SUGGEST",
  "DIALOGUE_VARIANT",
]);

// AI suggestion workflow status
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
]);

// Character role in a label
export const characterRoleEnum = pgEnum("character_role", [
  "PRIMARY",
  "SECONDARY",
  "BACKGROUND",
  "MENTIONED",
]);

// Ren'Py definition categories
export const renpyDefinitionCategoryEnum = pgEnum("renpy_definition_category", [
  "CHARACTER",
  "TRANSFORM",
  "IMAGE",
  "INIT",
]);

// Label visibility types
export const labelVisibilityEnum = pgEnum("label_visibility", [
  "EXCLUSIVE",
  "SHARED",
  "DUO_PAIR",
]);

// GitLab sync operation types
export const syncOperationEnum = pgEnum("sync_operation", ["export", "import"]);

// GitLab sync status types
export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

// GitLab file types
export const gitlabFileTypeEnum = pgEnum("gitlab_file_type", [
  "STORY",
  "SETTINGS",
]);

