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
export type UserRole = 'OWNER' | 'READER' | 'TESTER';
export const UserRole = {
  OWNER: 'OWNER',
  READER: 'READER',
  TESTER: 'TESTER',
} as const;

/**
 * Project type enumeration
 */
export type ProjectType = 'PREQUEL' | 'SEQUEL';
export const ProjectType = {
  PREQUEL: 'PREQUEL',
  SEQUEL: 'SEQUEL',
} as const;

/**
 * Scene status enumeration
 */
export type SceneStatus = 'DRAFT' | 'REVIEW' | 'FINAL';
export const SceneStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  FINAL: 'FINAL',
} as const;

/**
 * Route type enumeration
 * Prequel: EILEEN, LUCAS, SHARED
 * Sequel: FEMALE, MALE, COMBINED, COMMON
 */
export type RouteType = 'EILEEN' | 'LUCAS' | 'SHARED' | 'FEMALE' | 'MALE' | 'COMBINED' | 'COMMON';
export const RouteType = {
  EILEEN: 'EILEEN',
  LUCAS: 'LUCAS',
  SHARED: 'SHARED',
  FEMALE: 'FEMALE',
  MALE: 'MALE',
  COMBINED: 'COMBINED',
  COMMON: 'COMMON',
} as const;

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

export type VisualPattern = 'ACT_SCENE_SLUG_COUNTER' | 'CHAPTER_SCENE_SLUG_COUNTER';

export interface VisualSystemConfig {
  pattern: VisualPattern;
  actPrefixes?: Record<string, string>;
  chapterPrefix?: string;
  scenePadding: 1 | 2;
  counterPadding: 1 | 2;
  jumpPrefixShared: string;
  jumpPrefixRouteA: string;
  jumpPrefixRouteB: string;
  routeAName: string;
  routeBName: string;
  placeholderBaseUrl?: string;
}

export interface VisualNameComponents {
  act?: string;
  chapter?: number;
  sceneNumber: number;
  counter: number;
  slug: string;
}

// ============================================================================
// Pure Function: Visual Name Generation
// ============================================================================

/**
 * Generates a visual label/filename based on the visual system pattern.
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
  const parts: string[] = [];

  if (config.pattern === 'ACT_SCENE_SLUG_COUNTER') {
    // Prequel pattern: {act_prefix}{scene}_{counter}_{slug}
    const actPrefix = components.act && config.actPrefixes
      ? config.actPrefixes[components.act]
      : '';

    const sceneNum = String(components.sceneNumber).padStart(config.scenePadding, '0');
    const counter = String(components.counter).padStart(config.counterPadding, '0');

    if (actPrefix) parts.push(actPrefix);
    parts.push(sceneNum, counter, components.slug);

  } else {
    // Sequel pattern: {chapter_prefix}{chapter}_{scene}_{counter}_{slug}
    const chapterPrefix = config.chapterPrefix || 'ch';
    const chapter = String(components.chapter).padStart(1, '0');
    const sceneNum = String(components.sceneNumber).padStart(config.scenePadding, '0');
    const counter = String(components.counter).padStart(config.counterPadding, '0');

    parts.push(`${chapterPrefix}${chapter}`, sceneNum, counter, components.slug);
  }

  return parts.join('_');
}

/**
 * Generates a jump label for Ren'Py based on route and scene info.
 *
 * @param config - The visual system configuration
 * @param route - The route type
 * @param sceneNumber - The scene number
 * @returns The generated jump label
 */
export function generateJumpLabel(
  config: VisualSystemConfig,
  route: RouteType | null,
  sceneNumber: number,
): string {
  const sceneNum = String(sceneNumber).padStart(config.scenePadding, '0');

  if (!route || route === RouteType.SHARED || route === RouteType.COMMON) {
    return `${config.jumpPrefixShared}${sceneNum}`;
  }

  if (route === RouteType.LUCAS || route === RouteType.MALE) {
    return `${config.jumpPrefixRouteA}${sceneNum}`;
  }

  if (route === RouteType.EILEEN || route === RouteType.FEMALE) {
    return `${config.jumpPrefixRouteB}${sceneNum}`;
  }

  // Fallback for other routes
  return `${route.toLowerCase()}_${sceneNum}`;
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
  type: ProjectType;
  description?: string;
  createdAt: Date;
}

export interface Scene {
  id: string;
  projectId: string;
  title: string;
  act?: string;
  chapter?: number;
  sceneNumber: number;
  route?: RouteType;
  status: SceneStatus;
  createdAt: Date;
}
