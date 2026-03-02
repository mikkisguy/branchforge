/**
 * Project Context
 *
 * Provides state management for projects across the application.
 * Handles the current selected project and the list of available projects.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { projectsApi, type Project } from "@/lib/api/projects";

// ============================================================================
// Types
// ============================================================================

interface ProjectContextType {
  // Projects state
  projects: Project[];
  currentProject: Project | null;
  isLoadingProjects: boolean;
  projectsError: string | null;

  // Methods
  refreshProjects: () => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  createProject: (name: string, type: "PREQUEL" | "SEQUEL") => Promise<Project>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  /**
   * Load projects on mount
   */
  useEffect(() => {
    refreshProjects();
  }, []);

  /**
   * Refresh the list of projects from the server
   */
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setProjectsError(null);
    try {
      const fetchedProjects = await projectsApi.listProjects();
      setProjects(fetchedProjects);

      // If there's a current project, update it from the fresh list
      if (currentProject) {
        const updated = fetchedProjects.find(p => p.id === currentProject.id);
        if (updated) {
          setCurrentProject(updated);
        }
      }

      // Auto-select first project if none selected and projects exist
      if (!currentProject && fetchedProjects.length > 0) {
        setCurrentProject(fetchedProjects[0]);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load projects";
      setProjectsError(message);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [currentProject]);

  /**
   * Set the current project
   */
  const handleSetCurrentProject = useCallback((project: Project | null) => {
    setCurrentProject(project);
  }, []);

  /**
   * Create a new project
   */
  const createProject = useCallback(
    async (name: string, type: "PREQUEL" | "SEQUEL"): Promise<Project> => {
      const newProject = await projectsApi.createProject({
        name,
        type,
      });

      // Refresh the project list
      await refreshProjects();

      return newProject;
    },
    [refreshProjects]
  );

  const value: ProjectContextType = {
    projects,
    currentProject,
    isLoadingProjects,
    projectsError,
    refreshProjects,
    setCurrentProject: handleSetCurrentProject,
    createProject,
  };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useProject(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}
