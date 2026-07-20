/**
 * Validation Schemas — Barrel Re-export
 *
 * This file re-exports all validation schemas from the modular
 * `validation/` directory for backward compatibility.
 * All previous imports from `lib/validation.js` continue to work.
 */

export * from "./validation/common.js";
export * from "./validation/enums.js";
export * from "./validation/auth.js";
export * from "./validation/pagination.js";
export * from "./validation/route-configs.js";
export * from "./validation/projects.js";
export * from "./validation/labels.js";
export * from "./validation/variables.js";
export * from "./validation/stats.js";
export * from "./validation/pair-groups.js";
export * from "./validation/characters.js";
export * from "./validation/world-elements.js";
export * from "./validation/gitlab.js";
export * from "./validation/export-import.js";
export * from "./validation/user-settings.js";
export * from "./validation/session.js";
