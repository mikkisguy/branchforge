/**
 * BranchForge Database Schema
 *
 * Complete Drizzle ORM schema for the Visual Novel IDE.
 * This module re-exports all tables, enums, and types from their respective modules.
 *
 * Based on Database_Schemas.md specification.
 */

// ============================================================================
// ENUMS
// ============================================================================

export * from "./enums.js";

// ============================================================================
// TABLES & TYPES
// ============================================================================

// User tables
export * from "./tables/users.js";
export * from "./tables/sessions.js";
export * from "./tables/user-settings.js";
export * from "./tables/admin-settings.js";

// Project tables
export * from "./tables/projects.js";
export * from "./tables/project-settings.js";

// Project Files (unified for all sources)
export * from "./tables/project-files.js";

// Visual system tables
export * from "./tables/visual-systems.js";
export * from "./tables/route-configs.js";

// Ren'Py definitions
export * from "./tables/renpy-definitions.js";

// Character tables
export * from "./tables/characters.js";
export * from "./tables/pair-groups.js";

// Game state tables
export * from "./tables/meters.js";
export * from "./tables/state_variables.js";

// Content tables
export * from "./tables/labels.js";
export * from "./tables/label-lines.js";
export * from "./tables/label-characters.js";
export * from "./tables/label-dialogue-versions.js";

// World building
export * from "./tables/world-elements.js";

// AI features
export * from "./tables/ai-suggestions.js";

// Import/Export
export * from "./tables/exports.js";
export * from "./tables/import-logs.js";

// GitLab Integration
export * from "./tables/gitlab-integrations.js";

// Demo features
export * from "./tables/demo-sessions.js";
