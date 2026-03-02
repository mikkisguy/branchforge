/**
 * GitLab Integration Context
 *
 * Provides state management for GitLab integration across the application.
 * Handles user's GitLab integration status and linked projects.
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { gitlabApi, GitLabProject, type SyncOperation } from '@/lib/api/gitlab';

// ============================================================================
// Types
// ============================================================================

export interface GitLabIntegration {
  id: string;
  username?: string;
  gitlabUrl?: string;
  createdAt: string;
}

export interface LinkedRepository {
  id: string;
  projectId: string;
  gitlabProjectId: number;
  repositoryName: string;
  defaultBranch: string;
  lastSyncedAt?: string;
}

interface GitLabContextType {
  // Integration state
  integration: GitLabIntegration | null;
  hasIntegration: boolean;
  isLoadingIntegration: boolean;
  integrationError: string | null;

  // Linked repositories state
  linkedRepositories: Map<string, LinkedRepository>;
  isLoadingRepositories: boolean;

  // Methods
  refreshIntegration: () => Promise<void>;
  storeToken: (token: string, gitlabUrl?: string) => Promise<void>;
  removeIntegration: () => Promise<void>;
  validateToken: (token: string, gitlabUrl?: string) => Promise<{ valid: boolean; username?: string }>;
  listProjects: () => Promise<GitLabProject[]>;
  isProjectLinked: (projectId: string) => boolean;
  getLinkedRepository: (projectId: string) => LinkedRepository | undefined;
}

const GitLabContext = createContext<GitLabContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface GitLabProviderProps {
  children: ReactNode;
}

export function GitLabProvider({ children }: GitLabProviderProps) {
  const [integration, setIntegration] = useState<GitLabIntegration | null>(null);
  const [isLoadingIntegration, setIsLoadingIntegration] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [linkedRepositories, setLinkedRepositories] = useState<Map<string, LinkedRepository>>(new Map());
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);

  /**
   * Check if user has a GitLab integration stored
   * This is called on mount to initialize the state
   */
  const refreshIntegration = useCallback(async () => {
    setIsLoadingIntegration(true);
    setIntegrationError(null);
    try {
      // We can infer the integration status by trying to list projects
      // If the user has an integration, this will succeed
      const projects = await gitlabApi.getProjects();
      // If we got here, user has an integration
      setIntegration({
        id: 'current',
        createdAt: new Date().toISOString(),
      });
      setLinkedRepositories(new Map());
    } catch (error) {
      // User doesn't have an integration
      setIntegration(null);
      setLinkedRepositories(new Map());
    } finally {
      setIsLoadingIntegration(false);
    }
  }, []);

  /**
   * Store a GitLab token
   */
  const storeToken = useCallback(async (token: string, gitlabUrl?: string) => {
    setIntegrationError(null);
    try {
      await gitlabApi.storeIntegration(token, gitlabUrl);
      setIntegration({
        id: 'current',
        username: undefined, // Will be populated by validation
        gitlabUrl,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to store GitLab integration';
      setIntegrationError(message);
      throw error;
    }
  }, []);

  /**
   * Remove the GitLab integration
   */
  const removeIntegration = useCallback(async () => {
    setIntegrationError(null);
    try {
      await gitlabApi.deleteIntegration();
      setIntegration(null);
      setLinkedRepositories(new Map());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove GitLab integration';
      setIntegrationError(message);
      throw error;
    }
  }, []);

  /**
   * Validate a GitLab token
   */
  const validateToken = useCallback(async (token: string, gitlabUrl?: string) => {
    return gitlabApi.validateToken(token, gitlabUrl);
  }, []);

  /**
   * List user's GitLab projects
   */
  const listProjects = useCallback(async (): Promise<GitLabProject[]> => {
    return gitlabApi.getProjects();
  }, []);

  /**
   * Check if a project is linked to a GitLab repository
   */
  const isProjectLinked = useCallback((projectId: string): boolean => {
    return linkedRepositories.has(projectId);
  }, [linkedRepositories]);

  /**
   * Get the linked repository for a project
   */
  const getLinkedRepository = useCallback((projectId: string): LinkedRepository | undefined => {
    return linkedRepositories.get(projectId);
  }, [linkedRepositories]);

  // Initialize integration state on mount
  useEffect(() => {
    refreshIntegration();
  }, [refreshIntegration]);

  const value: GitLabContextType = {
    integration,
    hasIntegration: !!integration,
    isLoadingIntegration,
    integrationError,
    linkedRepositories,
    isLoadingRepositories,
    refreshIntegration,
    storeToken,
    removeIntegration,
    validateToken,
    listProjects,
    isProjectLinked,
    getLinkedRepository,
  };

  return <GitLabContext.Provider value={value}>{children}</GitLabContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useGitLab(): GitLabContextType {
  const context = useContext(GitLabContext);
  if (!context) {
    throw new Error('useGitLab must be used within GitLabProvider');
  }
  return context;
}
