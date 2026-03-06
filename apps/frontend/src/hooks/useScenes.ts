/**
 * useScenes Hook
 *
 * Provides scene state and operations using TanStack Query.
 * Follows the established patterns from useProject and useGitLab.
 *
 * Active scene ID is stored separately in the query cache to enable
 * cache-based scene selection while avoiding closure issues.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sceneKeys } from "@/lib/query-keys";
import { scenesApi } from "@/lib/api/scenes";
import { useProject } from "@/hooks/useProject";
import type { PublicScene, SceneDetail } from "@branchforge/shared";

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export interface UseScenesReturn {
  // Scenes state
  scenes: PublicScene[];
  scenesMap: Map<string, PublicScene>;
  activeScene: SceneDetail | undefined;
  activeSceneId: string | null;
  isLoadingScenes: boolean;
  isLoadingScene: boolean;

  // Methods
  setActiveSceneId: (sceneId: string | null) => void;
  invalidateScenes: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useScenes(): UseScenesReturn {
  const queryClient = useQueryClient();
  const { currentProject } = useProject();

  // Query for all scenes in the current project
  const {
    data: scenes = [],
    isLoading: isLoadingScenes,
  } = useQuery({
    queryKey: currentProject ? sceneKeys.lists(currentProject.id) : ["scenes", "none"],
    queryFn: () => scenesApi.listScenes({ projectId: currentProject!.id }),
    enabled: !!currentProject,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Query for active scene ID from cache (reactive subscription)
  const {
    data: activeSceneIdFromCache = null,
  } = useQuery<string | null>({
    queryKey: currentProject ? sceneKeys.activeSceneId(currentProject.id) : ['activeSceneId', 'none'],
    queryFn: () => {
      // This reads from cache - the actual subscription is maintained by useQuery
      const cached = queryClient.getQueryData<string | null>(
        sceneKeys.activeSceneId(currentProject!.id),
      );
      return cached ?? null;
    },
    enabled: !!currentProject,
    staleTime: Infinity, // This is client-side state, never goes stale
  });

  // Local state for active scene ID (synced with cache)
  const [localActiveSceneId, setLocalActiveSceneId] = useState<string | null>(
    activeSceneIdFromCache ?? null,
  );

  // Sync local state with cache changes
  useEffect(() => {
    if (activeSceneIdFromCache !== localActiveSceneId) {
      setLocalActiveSceneId(activeSceneIdFromCache ?? null);
    }
  }, [activeSceneIdFromCache]);

  // Query for active scene detail
  const {
    data: activeScene,
    isLoading: isLoadingScene,
  } = useQuery({
    queryKey:
      localActiveSceneId && currentProject
        ? sceneKeys.detail(currentProject.id, localActiveSceneId)
        : ["scenes", "detail", "none"],
    queryFn: () => scenesApi.getScene(localActiveSceneId!),
    enabled: !!localActiveSceneId && !!currentProject,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Memoized map for efficient lookups (like useProject pattern)
  const scenesMap = useMemo(
    () => new Map(scenes.map((s) => [s.id, s])),
    [scenes],
  );

  // Set active scene method (updates both local state and cache)
  const setActiveSceneId = useCallback(
    (sceneId: string | null) => {
      setLocalActiveSceneId(sceneId);
      if (currentProject) {
        queryClient.setQueryData(
          sceneKeys.activeSceneId(currentProject.id),
          sceneId,
        );
      }
    },
    [currentProject, queryClient],
  );

  // Invalidate scenes method
  const invalidateScenes = useCallback(async () => {
    if (currentProject) {
      await queryClient.invalidateQueries({
        queryKey: sceneKeys.lists(currentProject.id),
      });
    }
  }, [currentProject, queryClient]);

  return {
    scenes,
    scenesMap,
    activeScene,
    activeSceneId: localActiveSceneId,
    isLoadingScenes,
    isLoadingScene,
    setActiveSceneId,
    invalidateScenes,
  };
}
