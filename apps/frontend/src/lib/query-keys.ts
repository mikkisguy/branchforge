/**
 * Centralized query key management for TanStack Query
 *
 * Query keys are hierarchical arrays that enable:
 * - Automatic cache invalidation via partial matching
 * - Type-safe query key construction
 * - Predictable cache organization
 */

import type { SourceOrigin, FlowLayoutMode } from "@branchforge/shared";

// ============================================================================
// Auth Keys
// ============================================================================

export const authKeys = {
  all: ["auth"] as const,
  user: () => ["auth", "user"] as const,
} as const;

// ============================================================================
// Settings Keys
// ============================================================================

export const settingsKeys = {
  all: ["settings"] as const,
  signUps: () => ["settings", "signups"] as const,
} as const;

export const userSettingsKeys = {
  all: ["userSettings"] as const,
  settings: () => ["userSettings", "settings"] as const,
} as const;

// ============================================================================
// Writing Goals Keys
// ============================================================================

export const writingGoalsKeys = {
  all: ["writingGoals"] as const,
  settings: () => ["writingGoals", "settings"] as const,
} as const;

// ============================================================================
// GitLab Keys
// ============================================================================

export const gitlabKeys = {
  all: ["gitlab"] as const,
  integration: () => ["gitlab", "integration"] as const,
  repositories: () => ["gitlab", "repositories"] as const,
  repository: (projectId: string) =>
    ["gitlab", "repositories", projectId] as const,
  projects: () => ["gitlab", "projects"] as const,
  branches: (projectId: string) => ["gitlab", "branches", projectId] as const,
  files: (projectId: string, branch: string) =>
    ["gitlab", "files", projectId, branch] as const,
  importedFiles: (projectId: string) =>
    ["gitlab", "imported-files", projectId] as const,
  file: (fileId: string) => ["gitlab", "file", fileId] as const,
  operations: (projectId: string) =>
    ["gitlab", "operations", projectId] as const,
  operation: (operationId: string) =>
    ["gitlab", "operations", operationId] as const,
} as const;

// ============================================================================
// Project Files Keys
// ============================================================================

export const projectFilesKeys = {
  all: ["projectFiles"] as const,
  lists: (projectId: string) => ["projectFiles", projectId, "list"] as const,
  listsWithSource: (projectId: string, source: SourceOrigin) =>
    ["projectFiles", projectId, "list", source] as const,
  detail: (projectId: string, fileId: string) =>
    ["projectFiles", projectId, "detail", fileId] as const,
  content: (projectId: string, filePath: string, source: SourceOrigin) =>
    ["projectFiles", projectId, "content", filePath, source] as const,
} as const;

// ============================================================================
// Project Keys
// ============================================================================

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => ["projects", "list"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  current: () => ["projects", "current"] as const,
} as const;

// ============================================================================
// Label Keys
// ============================================================================

export const labelKeys = {
  all: ["labels"] as const,
  scoped: (projectId: string) => ["labels", projectId] as const,
  lists: (projectId: string) => ["labels", projectId, "list"] as const,
  listsWithFilters: (
    projectId: string,
    filters?: { routeKey?: string; status?: string }
  ) => ["labels", projectId, "list", filters] as const,
  detail: (projectId: string, labelId: string) =>
    ["labels", projectId, "detail", labelId] as const,
  activeLabelId: (projectId: string) =>
    ["labels", projectId, "activeLabelId"] as const,
  versions: (labelId: string) => ["labels", labelId, "versions"] as const,
  characters: (labelId: string) => ["labels", labelId, "characters"] as const,
} as const;

// ============================================================================
// Route Config Keys
// ============================================================================

export const routeConfigKeys = {
  all: ["routeConfigs"] as const,
  lists: (projectId: string) => ["routeConfigs", projectId, "list"] as const,
  detail: (routeConfigId: string) =>
    ["routeConfigs", "detail", routeConfigId] as const,
} as const;

// ============================================================================
// Visual System Keys
// ============================================================================

export const visualSystemKeys = {
  all: ["visualSystems"] as const,
  config: (projectId: string) =>
    ["visualSystems", projectId, "config"] as const,
} as const;

// ============================================================================
// World Element Keys
// ============================================================================

export const worldElementKeys = {
  all: ["worldElements"] as const,
  lists: (projectId: string) => ["worldElements", projectId, "list"] as const,
  detail: (elementId: string) =>
    ["worldElements", "detail", elementId] as const,
} as const;

// ============================================================================
// Variable Keys
// ============================================================================

export const variableKeys = {
  all: ["variables"] as const,
  lists: (projectId: string) => ["variables", projectId, "list"] as const,
  detail: (variableId: string) => ["variables", "detail", variableId] as const,
} as const;

// ============================================================================
// Character Keys
// ============================================================================

export const characterKeys = {
  all: ["characters"] as const,
  lists: (projectId: string) => ["characters", projectId, "list"] as const,
  detail: (characterId: string) =>
    ["characters", "detail", characterId] as const,
} as const;

// ============================================================================
// Stat Keys
// ============================================================================

export const statKeys = {
  all: ["stats"] as const,
  lists: (projectId: string) => ["stats", projectId, "list"] as const,
  detail: (statId: string) => ["stats", "detail", statId] as const,
  progression: (projectId: string) =>
    ["stats", projectId, "progression"] as const,
} as const;

// ============================================================================
// Flow Graph Keys
// ============================================================================

export const flowKeys = {
  all: ["flow"] as const,
  graph: (projectId: string) => ["flow", projectId, "graph"] as const,
  layout: (projectId: string, mode: FlowLayoutMode) =>
    ["flow", projectId, "layout", mode] as const,
} as const;

// ============================================================================
// Pair Group Keys
// ============================================================================

export const pairGroupKeys = {
  all: ["pairGroups"] as const,
  lists: (projectId: string) => ["pairGroups", projectId, "list"] as const,
};

export const exportKeys = {
  all: ["exports"] as const,
  lists: (projectId: string) => ["exports", projectId, "list"] as const,
} as const;
