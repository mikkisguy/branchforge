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
 * Scene status enumeration
 */
export type SceneStatus = "DRAFT" | "REVIEW" | "FINAL";
export const SceneStatus = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  FINAL: "FINAL",
} as const;

/**
 * Scene visibility enumeration
 */
export type SceneVisibility = "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
export const SceneVisibility = {
  EXCLUSIVE: "EXCLUSIVE",
  SHARED: "SHARED",
  DUO_PAIR: "DUO_PAIR",
} as const;

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
  namingTemplate: string; // e.g., "{route}{group}_{scene}_{counter}_{slug}"
  groupPrefixes?: Record<string, Record<string, string>>; // { "act": { "I": "ai" }, "chapter": { "1": "ch1" } }
  defaultGroupType?: string; // "act", "chapter", etc.
  scenePadding: 1 | 2;
  counterPadding: 1 | 2;
  jumpPrefixShared: string;
  placeholderBaseUrl?: string;
}

export interface VisualNameComponents {
  groupType?: string; // "act", "chapter", etc.
  groupValue?: string; // "I", "1", etc.
  routeKey?: string;
  sceneNumber: number;
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
  components: VisualNameComponents,
): string {
  let result = config.namingTemplate;

  // Replace {route}
  if (components.routeKey) {
    const routePrefix = components.routeKey ? components.routeKey + "_" : "";
    result = result.replace('{route}', routePrefix);
  } else {
    result = result.replace('{route}', '');
  }

  // Replace {group} - look up prefix if available
  if (components.groupType && components.groupValue && config.groupPrefixes?.[components.groupType]) {
    const prefix = config.groupPrefixes[components.groupType][components.groupValue] || components.groupValue;
    result = result.replace('{group}', prefix);
  } else if (components.groupValue) {
    result = result.replace('{group}', components.groupValue);
  } else {
    result = result.replace('{group}', '');
  }

  // Replace {scene}, {counter}, {slug}
  result = result.replace('{scene}', String(components.sceneNumber).padStart(config.scenePadding, '0'));
  result = result.replace('{counter}', String(components.counter).padStart(config.counterPadding, '0'));
  result = result.replace('{slug}', components.slug);

  // Clean up double underscores and trim
  return result.replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Generates a jump label for Ren'Py based on route configuration and scene info.
 *
 * @param routeConfig - The route configuration (null for shared scenes)
 * @param sceneNumber - The scene number
 * @param scenePadding - The padding for scene numbers (1 or 2)
 * @returns The generated jump label
 */
export function generateJumpLabel(
  routeConfig: RouteConfig | null,
  sceneNumber: number,
  scenePadding: 1 | 2,
): string {
  const sceneNum = String(sceneNumber).padStart(scenePadding, "0");

  if (!routeConfig || routeConfig.isShared) {
    return sceneNum;
  }

  return `${routeConfig.jumpPrefix}${sceneNum}`;
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

export interface Scene {
  id: string;
  projectId: string;
  title: string;
  groupType?: string;   // e.g., "act", "chapter", "episode"
  groupValue?: string;  // e.g., "I", "1", "1a"
  sceneNumber: number;
  routeKey?: string; // References route_configs.route_key (custom user-defined routes)
  status: SceneStatus;
  createdAt: Date;
}

// ============================================================================
// Scene Types (for frontend-backend communication)
// ============================================================================

/**
 * Public scene information (without sensitive data)
 * This matches the backend's PublicScene interface
 */
export interface PublicScene {
  id: string;
  projectId: string;
  title: string;
  groupType: string | null;  // e.g., "act", "chapter", "episode" or null
  groupValue: string | null; // e.g., "I", "1", "1a" or null
  sceneNumber: number;
  sequenceOrder: number;
  routeKey: string | null;
  status: SceneStatus | null;
  visibility: SceneVisibility | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scene line content type enumeration
 */
export type SceneLineContentType =
  | "DIALOGUE"
  | "NARRATION"
  | "CHOICE"
  | "MENU"
  | "JUMP";

/**
 * Scene visual type enumeration
 */
export type SceneVisualType = "GENERATED" | "BLACK" | "CUSTOM";

/**
 * Scene line with speaker information
 */
export interface SceneLine {
  id: string;
  sceneId: string;
  sequence: number;
  contentType: SceneLineContentType;
  content: string;
  visualType: SceneVisualType;
  visualPrompt: string | null;
  speakerId: string | null;
  speakerName: string | null;
  speakerTag: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scene character role enumeration
 */
export type SceneCharacterRole =
  | "PRIMARY"
  | "SECONDARY"
  | "BACKGROUND"
  | "MENTIONED";

/**
 * GitLab file type enumeration
 */
export type GitLabFileType = "STORY" | "SETTINGS";
export const GitLabFileType = {
  STORY: "STORY",
  SETTINGS: "SETTINGS",
} as const;

/**
 * GitLab file information
 * Represents a GitLab file tracked in the system
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
 * Character in a scene with role information
 */
export interface SceneCharacter {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
  role: SceneCharacterRole;
  emotion: string | null;
  notes: string | null;
}

/**
 * Detailed scene information with lines and characters
 */
export interface SceneDetail extends PublicScene {
  lines: SceneLine[];
  characters: SceneCharacter[];
}

