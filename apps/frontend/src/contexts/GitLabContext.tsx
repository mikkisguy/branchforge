/**
 * GitLab Integration Context
 *
 * Provides state management for GitLab integration across the application.
 * Handles user's GitLab integration status and linked projects.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { gitlabApi, GitLabProject } from "@/lib/api/gitlab";

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

export interface GitLabContextType {
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
  validateToken: (
    token: string,
    gitlabUrl?: string,
  ) => Promise<{ valid: boolean; username?: string }>;
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
  const [integration, setIntegration] = useState<GitLabIntegration | null>(
    null,
  );
  const [isLoadingIntegration, setIsLoadingIntegration] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [linkedRepositories, setLinkedRepositories] = useState<
    Map<string, LinkedRepository>
  >(new Map());
  const [isLoadingRepositories] = useState(false);

  /**
   * Check if user has a GitLab integration stored
   * This is called on mount to initialize the state
   */
  const refreshIntegration = useCallback(async () => {
    setIsLoadingIntegration(true);
    setIntegrationError(null);
    try {
      // Fetch the actual integration metadata from the backend
      const integrationData = await gitlabApi.getIntegration();
      if (integrationData) {
        setIntegration({
          id: integrationData.id,
          username: integrationData.username,
          gitlabUrl: integrationData.gitlabUrl,
          createdAt: integrationData.createdAt,
        });

        // TODO: Fetch linked repositories from backend
        // const repos = await gitlabApi.getLinkedRepositories();
        // setLinkedRepositories(new Map(repos.map(r => [r.projectId, r])));
        setLinkedRepositories(new Map());
      } else {
        // No integration found
        setIntegration(null);
        setLinkedRepositories(new Map());
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      // Check if this is a definitive "no integration" error (404)
      // The backend returns 404 with "GitLab integration not found" when no integration exists
      if (
        errorMessage.includes("GitLab integration not found") ||
        errorMessage.includes("404")
      ) {
        // User doesn't have an integration - clear state
        setIntegration(null);
        setLinkedRepositories(new Map());
      } else {
        // Transient or server error - preserve existing state and set error message
        setIntegrationError(errorMessage);
      }
    } finally {
      setIsLoadingIntegration(false);
    }
  }, []);

  /**
   * Store a GitLab token
   */
  const storeToken = useCallback(
    async (token: string, gitlabUrl?: string) => {
      setIntegrationError(null);
      try {
        await gitlabApi.storeIntegration(token, gitlabUrl);
        // Refresh to get the real integration data from backend
        await refreshIntegration();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to store GitLab integration";
        setIntegrationError(message);
        throw error;
      }
    },
    [refreshIntegration],
  );

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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to remove GitLab integration";
      setIntegrationError(message);
      throw error;
    }
  }, []);

  /**
   * Validate a GitLab token
   */
  const validateToken = useCallback(
    async (token: string, gitlabUrl?: string) => {
      return gitlabApi.validateToken(token, gitlabUrl);
    },
    [],
  );

  /**
   * List user's GitLab projects
   */
  const listProjects = useCallback(async (): Promise<GitLabProject[]> => {
    return gitlabApi.getProjects();
  }, []);

  /**
   * Check if a project is linked to a GitLab repository
   */
  const isProjectLinked = useCallback(
    (projectId: string): boolean => {
      return linkedRepositories.has(projectId);
    },
    [linkedRepositories],
  );

  /**
   * Get the linked repository for a project
   */
  const getLinkedRepository = useCallback(
    (projectId: string): LinkedRepository | undefined => {
      return linkedRepositories.get(projectId);
    },
    [linkedRepositories],
  );

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

  return (
    <GitLabContext.Provider value={value}>{children}</GitLabContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useGitLab(): GitLabContextType {
  const context = useContext(GitLabContext);
  if (!context) {
    throw new Error("useGitLab must be used within GitLabProvider");
  }
  return context;
}

