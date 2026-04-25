/**
 * Shared types and utilities for BranchForge
 *
 * This package is the single source of truth for all types shared between
 * the frontend and backend. When adding types that could be used by both apps:
 * 1. Add them here
 * 2. Import as: `import type { YourType } from '@branchforge/shared'`
 */

// ============================================================================
// Core Enums
// ============================================================================

/**
 * User role enumeration
 */
export type UserRole = "OWNER" | "READER" | "TESTER";
export const UserRole = {
  OWNER: "OWNER",
  READER: "READER",
  TESTER: "TESTER",
} as const;

/**
 * Validates that a value is a valid UserRole.
 * @param value - The value to validate
 * @returns true if the value is a valid UserRole
 */
export function isValidUserRole(value: string): value is UserRole {
  return value === "OWNER" || value === "READER" || value === "TESTER";
}

/**
 * Role hierarchy mapping for permission checks.
 * Higher numeric values indicate higher privileges.
 * Hierarchy: OWNER (3) > READER (2) > TESTER (1)
 */
export const ROLE_HIERARCHY = {
  OWNER: 3,
  READER: 2,
  TESTER: 1,
} as const;

/**
 * Label status enumeration
 */
export type LabelStatus = "DRAFT" | "REVIEW" | "FINAL";
export const LabelStatus = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  FINAL: "FINAL",
} as const;

/**
 * Label visibility enumeration
 */
export type LabelVisibility = "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
export const LabelVisibility = {
  EXCLUSIVE: "EXCLUSIVE",
  SHARED: "SHARED",
  DUO_PAIR: "DUO_PAIR",
} as const;

/**
 * Label sync status enumeration
 * Tracks synchronization state between local and GitLab versions
 */
export type LabelSyncStatus = "SYNCED" | "MODIFIED_LOCAL" | "CONFLICT";
export const LabelSyncStatus = {
  SYNCED: "SYNCED",
  MODIFIED_LOCAL: "MODIFIED_LOCAL",
  CONFLICT: "CONFLICT",
} as const;

/**
 * Validates that a value is a valid LabelSyncStatus.
 * @param value - The value to validate
 * @returns true if the value is a valid LabelSyncStatus
 */
export function isValidLabelSyncStatus(
  value: string
): value is LabelSyncStatus {
  return (
    value === "SYNCED" || value === "MODIFIED_LOCAL" || value === "CONFLICT"
  );
}

// ============================================================================
// Route Configuration
// ============================================================================

/**
 * Route configuration for a project
 * Routes are user-defined entities that replace hardcoded route enums
 */
export interface RouteConfig {
  id: string;
  projectId: string;
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  sortOrder: number;
  isShared: boolean;
}

// ============================================================================
// State Variable Configuration
// ============================================================================

/**
 * State Variable for conditional branching logic
 * State variables are boolean state variables used in prerequisites and effects
 */
export interface StateVariable {
  id: string;
  projectId: string;
  key: string;
  description: string | null;
  category: string | null;
  createdAt: string;
}

// ============================================================================
// Ren'Py Definition Configuration
// ============================================================================

/**
 * Ren'Py Definition category enumeration
 */
export type RenpyDefinitionCategory =
  | "CHARACTER"
  | "TRANSFORM"
  | "IMAGE"
  | "INIT";
export const RenpyDefinitionCategory = {
  CHARACTER: "CHARACTER",
  TRANSFORM: "TRANSFORM",
  IMAGE: "IMAGE",
  INIT: "INIT",
} as const;

/**
 * Ren'Py Definition for export to RPY files
 * Represents static Ren'Py language definitions
 */
export interface RenpyDefinition {
  id: string;
  projectId: string;
  category: RenpyDefinitionCategory;
  sortOrder: number;
  tag: string;
  displayName: string;
  definitionCode: string;
  referenceTag: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Public User Interface
// ============================================================================

/**
 * Public user information (without sensitive data)
 * This interface is used for API responses and session data
 */
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
}

// ============================================================================
// Visual Name Pattern Types
// ============================================================================

export interface VisualSystemConfig {
  namingTemplate: string; // e.g., "{route}{group}_{label}_{counter}_{slug}"
  groupPrefixes?: Record<string, Record<string, string>>; // { "act": { "I": "ai" }, "chapter": { "1": "ch1" } }
  defaultGroupType?: string; // "act", "chapter", etc.
  labelPadding: 1 | 2;
  counterPadding: 1 | 2;
  jumpPrefixShared: string;
  placeholderBaseUrl?: string;
}

export interface VisualNameComponents {
  groupType?: string; // "act", "chapter", etc.
  groupValue?: string; // "I", "1", etc.
  routeKey?: string;
  labelNumber: number;
  counter: number;
  slug: string;
}

// ============================================================================
// Pure Function: Visual Name Generation
// ============================================================================

/**
 * Generates a visual label/filename based on the visual system template.
 * This is used for auto-generating image filenames like "ai_01_02_cafe_01.png"
 *
 * @param config - The visual system configuration
 * @param components - The components to build the name from
 * @returns The generated visual name
 */
export function generateVisualName(
  config: VisualSystemConfig,
  components: VisualNameComponents
): string {
  let result = config.namingTemplate;

  // Replace {route}
  if (components.routeKey) {
    const routePrefix = components.routeKey + "_";
    result = result.replace("{route}", routePrefix);
  } else {
    result = result.replace("{route}", "");
  }

  // Replace {group} - look up prefix if available
  if (
    components.groupType &&
    components.groupValue &&
    config.groupPrefixes?.[components.groupType]
  ) {
    const prefix =
      config.groupPrefixes[components.groupType][components.groupValue] ||
      components.groupValue;
    result = result.replace("{group}", prefix);
  } else if (components.groupValue) {
    result = result.replace("{group}", components.groupValue);
  } else {
    result = result.replace("{group}", "");
  }

  // Replace {label}, {counter}, {slug}
  result = result.replace(
    "{label}",
    String(components.labelNumber).padStart(config.labelPadding, "0")
  );

  // Deprecated: {scene} fallback for compatibility
  result = result.replace(
    "{scene}",
    String(components.labelNumber).padStart(config.labelPadding, "0")
  );
  result = result.replace(
    "{counter}",
    String(components.counter).padStart(config.counterPadding, "0")
  );
  result = result.replace("{slug}", components.slug);

  // Clean up double underscores and trim
  return result.replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Generates a jump label for Ren'Py based on route configuration and label info.
 *
 * @param routeConfig - The route configuration (null for shared labels)
 * @param labelNumber - The label number
 * @param labelPadding - The padding for label numbers (1 or 2)
 * @returns The generated jump label
 */
export function generateJumpLabel(
  routeConfig: RouteConfig | null,
  labelNumber: number,
  labelPadding: 1 | 2
): string {
  const labelNum = String(labelNumber).padStart(labelPadding, "0");

  if (!routeConfig || routeConfig.isShared) {
    return labelNum;
  }

  return `${routeConfig.jumpPrefix}${labelNum}`;
}

// ============================================================================
// Basic Types (domain entities - minimal set for TDD setup)
// ============================================================================

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface Label {
  id: string;
  projectId: string;
  title: string;
  groupType?: string; // e.g., "act", "chapter", "episode"
  groupValue?: string; // e.g., "I", "1", "1a"
  labelNumber: number;
  routeKey?: string; // References route_configs.route_key (custom user-defined routes)
  status: LabelStatus;
  createdAt: Date;
}

// ============================================================================
// Label Types (for frontend-backend communication)
// ============================================================================

/**
 * Public label information (without sensitive data)
 * This matches the backend's PublicLabel interface
 */
export interface PublicLabel {
  id: string;
  projectId: string;
  title: string;
  groupType: string | null; // e.g., "act", "chapter", "episode" or null
  groupValue: string | null; // e.g., "I", "1", "1a" or null
  labelNumber: number;
  sequenceOrder: number;
  routeKey: string | null;
  status: LabelStatus | null;
  visibility: LabelVisibility | null;
  /** Version number for optimistic concurrency control */
  version?: number | null;
  /** SHA hash of label content for change detection */
  contentHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Label line content type enumeration
 */
export type LabelLineContentType =
  | "DIALOGUE"
  | "NARRATION"
  | "CHOICE"
  | "MENU"
  | "JUMP";

/**
 * Label visual type enumeration
 */
export type LabelVisualType = "GENERATED" | "BLACK" | "CUSTOM";

/**
 * Label line with speaker information
 */
export interface LabelLine {
  id: string;
  labelId: string;
  sequence: number;
  contentType: LabelLineContentType;
  content: string;
  visualType: LabelVisualType;
  visualPrompt: string | null;
  speakerId: string | null;
  speakerName: string | null;
  speakerTag: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Validation Helpers (Shared Patterns for Frontend & Backend)
// ============================================================================

/**
 * Regular expression for route configuration keys.
 * Allows letters, numbers, underscores, and hyphens.
 * @example
 * isValidRouteKey("hero_01") // true
 * isValidRouteKey("hero-route") // true
 * isValidRouteKey("hero route") // false
 */
export const ROUTE_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Regular expression for jump prefixes.
 * Allows letters, numbers, underscores, and hyphens.
 * @example
 * isValidJumpPrefix("hero_") // true
 * isValidJumpPrefix("hero-chapter_") // true
 * isValidJumpPrefix("hero chapter") // false
 */
export const JUMP_PREFIX_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates a route configuration key.
 * Route keys must contain only letters, numbers, underscores, and hyphens.
 *
 * @param value - The value to validate
 * @returns true if valid, false otherwise
 */
export function isValidRouteKey(value: string): boolean {
  return ROUTE_KEY_REGEX.test(value);
}

/**
 * Validates a jump prefix.
 * Jump prefixes must contain only letters, numbers, underscores, and hyphens.
 *
 * @param value - The value to validate
 * @returns true if valid, false otherwise
 */
export function isValidJumpPrefix(value: string): boolean {
  return JUMP_PREFIX_REGEX.test(value);
}

// ============================================================================
// Ren'Py Label Utilities
// ============================================================================

/**
 * Regular expression for matching Ren'Py label definitions.
 * Matches the label keyword followed by a valid identifier name.
 * Allows optional leading whitespace.
 *
 * @example
 * RENPY_LABEL_REGEX.exec("label start:") // matches, captures "start"
 * RENPY_LABEL_REGEX.exec("    label scene_1:") // matches, captures "scene_1"
 * RENPY_LABEL_REGEX.exec("label 2_invalid:") // does not match (starts with number)
 */
export const RENPY_LABEL_REGEX = /^\s*label\s+([a-zA-Z_][a-zA-Z0-9_]*)/;

/**
 * Sanitize a title to a valid Ren'Py label name.
 * Only allows [a-z0-9_], replaces invalid chars with underscore.
 * Ren'Py labels must start with a letter or underscore (not a number).
 *
 * @param title - The title to sanitize
 * @returns A valid Ren'Py label name, or "untitled" if sanitization fails
 *
 * @example
 * sanitizeLabelName("Hello World") // returns "hello_world"
 * sanitizeLabelName("My Label!") // returns "my_label"
 * sanitizeLabelName("123") // returns "untitled" (starts with number)
 * sanitizeLabelName("") // returns "untitled" (empty)
 */
export function sanitizeLabelName(title: string): string {
  let labelName = title
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!labelName || /^[0-9]/.test(labelName)) {
    labelName = "untitled";
  }

  return labelName;
}

/**
 * GitLab file type enumeration
 */
export type GitLabFileType = "STORY" | "SETTINGS";
export const GitLabFileType = {
  STORY: "STORY",
  SETTINGS: "SETTINGS",
} as const;

/**
 * Source origin enumeration
 * Indicates where content originated from (GitLab repository or ZIP file)
 */
export type SourceOrigin = "GITLAB" | "ZIP";
export const SourceOrigin = {
  GITLAB: "GITLAB",
  ZIP: "ZIP",
} as const;

/**
 * Validates that a value is a valid SourceOrigin.
 * @param value - The value to validate
 * @returns true if the value is a valid SourceOrigin
 */
export function isValidSourceOrigin(value: string): value is SourceOrigin {
  return value === "GITLAB" || value === "ZIP";
}

/**
 * Project file information (unified for all sources)
 * Represents a file tracked in the system from any source (GitLab, zip, etc.)
 */
export interface ProjectFile {
  id: string;
  projectId: string;
  filePath: string; // e.g., "labels/act_i.rpy" or "gui/screens.rpy"
  fileType: GitLabFileType;
  content: string; // Full RPY content for Script Mode
  source: SourceOrigin;
  contentHash: string; // SHA-256 hash for idempotency
  // GitLab-only fields (optional/nullable for non-GitLab sources)
  lastSyncedAt?: string | null;
  lastCommitSha?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Legacy: GitLab file information (use ProjectFile instead)
 * Represents a GitLab file tracked in the system
 * @deprecated Use ProjectFile with source: "GITLAB" instead
 */
export interface GitLabFile {
  id: string;
  projectId: string;
  filePath: string; // e.g., "labels/act_i.rpy" or "gui/screens.rpy"
  fileType: GitLabFileType;
  content: string; // Full RPY content for Script Mode
  lastSyncedAt: string | null;
  lastCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Character in a label with notes
 */
export interface LabelCharacter {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
  notes: string | null;
}

/**
 * Detailed label information with lines and characters
 */
export interface LabelDetail extends PublicLabel {
  lines: LabelLine[];
  characters: LabelCharacter[];
}

/**
 * Character in a visual novel project
 * Represents a character with dialogue lines and appearance settings
 */
export interface Character {
  id: string;
  projectId: string;
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  avatarUrl: string | null;
  routeAffiliation: string | null;
  isLoveInterest: boolean;
  dialogueStyle: string | null;
  conditionalPrefix: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Character Detection Types
// ============================================================================

/**
 * Character detected from RPY files
 */
export interface DetectedCharacter {
  tag: string;
  name: string | null;
  displayName: string;
  color: string;
  isSpecial: boolean;
  sourceFile: string;
  confidence: number;
}

/**
 * Character conflict between detected and existing characters
 */
export interface CharacterConflict {
  tag: string;
  detectedName: string | null;
  existingName: string;
  detectedColor: string;
  existingColor: string;
}

/**
 * Response from character detection API
 */
export interface DetectCharactersResponse {
  characters: DetectedCharacter[];
  excludedTags: string[];
  conflicts: CharacterConflict[];
  existingTags: string[]; // Tags of all characters that exist in database (not just conflicts)
}

// ============================================================================
// File Upload Configuration
// ============================================================================

/**
 * Generic maximum file size for multipart uploads in megabytes.
 * This is the default limit used by the multipart plugin and global error handler.
 * Specific upload types (e.g., avatars) may have their own limits.
 */
export const UPLOAD_MAX_SIZE_MB = 5;

/**
 * Generic maximum file size for multipart uploads in bytes.
 * This is the default limit used by the multipart plugin.
 */
export const UPLOAD_MAX_SIZE = UPLOAD_MAX_SIZE_MB * 1024 * 1024; // 5MB in bytes

// ============================================================================
// Avatar Upload Configuration
// ============================================================================

/**
 * Allowed MIME types for avatar uploads
 */
export const AVATAR_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * Maximum file size for avatar uploads in megabytes
 */
export const AVATAR_MAX_SIZE_MB = 2;

/**
 * Maximum file size for avatar uploads in bytes
 */
export const AVATAR_MAX_SIZE = AVATAR_MAX_SIZE_MB * 1024 * 1024; // 2MB in bytes

/**
 * Validates if a MIME type is allowed for avatar uploads
 * @param mimeType - The MIME type to validate (can be undefined, null, or empty string)
 * @returns true if the MIME type is allowed
 */
export function isValidAvatarMimeType(
  mimeType: string | undefined | null
): boolean {
  if (!mimeType || typeof mimeType !== "string") {
    return false;
  }
  return AVATAR_ALLOWED_MIME_TYPES.includes(
    mimeType.toLowerCase() as (typeof AVATAR_ALLOWED_MIME_TYPES)[number]
  );
}

// ============================================================================
// ZIP Import Configuration
// ============================================================================

/**
 * Maximum file size for ZIP imports in megabytes
 */
export const ZIP_IMPORT_MAX_SIZE_MB = 50;

/**
 * Maximum file size for ZIP imports in bytes
 */
export const ZIP_IMPORT_MAX_SIZE = ZIP_IMPORT_MAX_SIZE_MB * 1024 * 1024; // 50MB in bytes

/**
 * Allowed MIME types for ZIP files
 *
 * Note: MIME types can be unreliable, so the .zip extension check
 * is the primary validation. This list includes common zip MIME types
 * that some systems send.
 */
export const ZIP_ALLOWED_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "application/octet-stream",
] as const;

/**
 * Validates if a MIME type is allowed for ZIP file uploads.
 * @param mimeType - The MIME type to validate (can be undefined, null, or empty string)
 * @returns true if the MIME type is allowed
 */
export function isValidZipMimeType(
  mimeType: string | undefined | null
): boolean {
  if (!mimeType || typeof mimeType !== "string") {
    return false;
  }
  return ZIP_ALLOWED_MIME_TYPES.includes(
    mimeType.toLowerCase() as (typeof ZIP_ALLOWED_MIME_TYPES)[number]
  );
}

// ============================================================================
// Public Project Types (API Response Types)
// ============================================================================

/**
 * Public project information (without sensitive data)
 * This matches the backend's PublicProject interface
 */
export interface PublicProject {
  id: string;
  name: string;
  description?: string;
  maxMeterDelta?: number;
  visibility?: UserRole;
  source: SourceOrigin;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ZIP Import Types
// ============================================================================

/**
 * Successful ZIP file import into existing project
 * Contains import statistics only (no project field)
 */
export interface ImportZipSuccess {
  success: true;
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  labelsCreated: number;
}

/**
 * Failed ZIP file import
 * Contains error information only
 */
export interface ImportZipFailure {
  success: false;
  error: string;
}

/**
 * Response from ZIP file import endpoint (importing into existing project)
 * Discriminated union: use response.success to narrow between success and failure
 * POST /projects/:projectId/import/zip
 */
export type ImportZipResponse = ImportZipSuccess | ImportZipFailure;

/**
 * Successful project creation from ZIP import
 * Contains the created project and import statistics
 */
export interface ImportProjectSuccess {
  success: true;
  project: PublicProject & { source: "ZIP" };
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  labelsCreated: number;
}

/**
 * Failed project creation from ZIP import
 * Contains error information only
 */
export interface ImportProjectFailure {
  success: false;
  error: string;
}

/**
 * Response from project creation via ZIP import endpoint
 * Discriminated union: use response.success to narrow between success and failure
 * POST /projects/import/zip
 */
export type ImportProjectResponse = ImportProjectSuccess | ImportProjectFailure;
