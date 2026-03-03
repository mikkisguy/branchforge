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
  useRef,
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

  // Track if initial load has occurred to avoid stale closure issues
  const initialLoadRef = useRef(true);

  // Ref to track currentProject for use in refreshProjects without causing dependency issues
  const currentProjectRef = useRef<Project | null>(null);

  // Track if component is mounted to avoid state updates after unmount
  const mountedRef = useRef(true);

  // Keep the ref in sync with currentProject
  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  // Set up mounted ref with cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Load projects on mount
   */
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;

      let mounted = true;

      const fetchInitialProjects = async () => {
        if (!mounted) return;
        setIsLoadingProjects(true);
        setProjectsError(null);

        try {
          const fetchedProjects = await projectsApi.listProjects();
          if (!mounted) return;

          setProjects(fetchedProjects);

          // Auto-select first project if none selected and projects exist
          if (fetchedProjects.length > 0) {
            setCurrentProject(fetchedProjects[0]);
          }
        } catch (error) {
          if (!mounted) return;
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load projects";
          setProjectsError(message);
        } finally {
          if (mounted) {
            setIsLoadingProjects(false);
          }
        }
      };

      fetchInitialProjects();

      return () => {
        mounted = false;
      };
    }
  }, []);

  /**
   * Refresh the list of projects from the server
   */
  const refreshProjects = useCallback(async () => {
    if (!mountedRef.current) return;

    setIsLoadingProjects(true);
    setProjectsError(null);

    try {
      const fetchedProjects = await projectsApi.listProjects();
      if (!mountedRef.current) return;

      setProjects(fetchedProjects);

      const current = currentProjectRef.current;

      // If there's a current project, try to update it from the fresh list
      if (current) {
        const updated = fetchedProjects.find(p => p.id === current.id);
        if (updated) {
          if (mountedRef.current) setCurrentProject(updated);
        } else {
          // Current project was deleted on server; fallback to first available or clear
          if (fetchedProjects.length > 0) {
            if (mountedRef.current) setCurrentProject(fetchedProjects[0]);
          } else {
            if (mountedRef.current) setCurrentProject(null);
          }
        }
      }

      // Auto-select first project if none selected and projects exist
      if (!current && fetchedProjects.length > 0) {
        if (mountedRef.current) setCurrentProject(fetchedProjects[0]);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load projects";
      setProjectsError(message);
    } finally {
      if (mountedRef.current) {
        setIsLoadingProjects(false);
      }
    }
  }, []); // No dependencies - stable reference

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
