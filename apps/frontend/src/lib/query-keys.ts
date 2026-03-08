/**
 * Centralized query key management for TanStack Query
 *
 * Query keys are hierarchical arrays that enable:
 * - Automatic cache invalidation via partial matching
 * - Type-safe query key construction
 * - Predictable cache organization
 */

// ============================================================================
// Auth Keys
// ============================================================================

export const authKeys = {
  all: ['auth'] as const,
  user: () => ['auth', 'user'] as const,
} as const;

// ============================================================================
// Settings Keys
// ============================================================================

export const settingsKeys = {
  all: ['settings'] as const,
  signUps: () => ['settings', 'signups'] as const,
} as const;

// ============================================================================
// GitLab Keys
// ============================================================================

export const gitlabKeys = {
  all: ['gitlab'] as const,
  integration: () => ['gitlab', 'integration'] as const,
  repositories: () => ['gitlab', 'repositories'] as const,
  repository: (projectId: string) => ['gitlab', 'repositories', projectId] as const,
  projects: () => ['gitlab', 'projects'] as const,
  branches: (projectId: string) => ['gitlab', 'branches', projectId] as const,
  files: (projectId: string, branch: string) => ['gitlab', 'files', projectId, branch] as const,
  importedFiles: (projectId: string) => ['gitlab', 'imported-files', projectId] as const,
  file: (fileId: string) => ['gitlab', 'file', fileId] as const,
  operations: (projectId: string) => ['gitlab', 'operations', projectId] as const,
  operation: (operationId: string) => ['gitlab', 'operations', operationId] as const,
} as const;

// ============================================================================
// Project Keys
// ============================================================================

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => ['projects', 'list'] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  current: () => ['projects', 'current'] as const,
} as const;

// ============================================================================
// Scene Keys
// ============================================================================

export const sceneKeys = {
  all: ['scenes'] as const,
  lists: (projectId: string) => ['scenes', projectId, 'list'] as const,
  listsWithFilters: (
    projectId: string,
    filters?: { routeKey?: string; status?: string },
  ) => ['scenes', projectId, 'list', filters] as const,
  detail: (projectId: string, sceneId: string) =>
    ['scenes', projectId, 'detail', sceneId] as const,
  activeSceneId: (projectId: string) =>
    ['scenes', projectId, 'activeSceneId'] as const,
} as const;

// ============================================================================
// Route Config Keys
// ============================================================================

export const routeConfigKeys = {
  all: ['routeConfigs'] as const,
  lists: (projectId: string) => ['routeConfigs', projectId, 'list'] as const,
  detail: (routeConfigId: string) =>
    ['routeConfigs', 'detail', routeConfigId] as const,
} as const;
