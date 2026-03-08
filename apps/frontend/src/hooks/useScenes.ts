/**
 * useScenes Hook
 *
 * Provides scene state and operations using TanStack Query.
 * Simplified with stable query keys and proper refetch behavior.
 */

import { useState, useCallback, useMemo } from "react";
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
  // Always runs with the project ID from useProject, refetches on mount
  const { data: scenes = [], isLoading: isLoadingScenes } = useQuery({
    queryKey: sceneKeys.lists(currentProject?.id ?? ""),
    queryFn: () => scenesApi.listScenes({ projectId: currentProject!.id }),
    enabled: !!currentProject?.id,
    refetchOnMount: "always",
    staleTime: 30 * 1000, // 30 seconds (reduced from 5 min for better reload UX)
  });

  // Local state for active scene ID
  // Initialize from query cache on mount to persist across navigation
  const [localActiveSceneId, setLocalActiveSceneId] = useState<string | null>(
    () => {
      if (!currentProject?.id) return null;
      const cached = queryClient.getQueryData<string | null>(
        sceneKeys.activeSceneId(currentProject.id),
      );
      return cached ?? null;
    },
  );

  // Query for active scene detail
  const { data: activeScene, isLoading: isLoadingScene } = useQuery({
    queryKey: sceneKeys.detail(
      currentProject?.id ?? "",
      localActiveSceneId ?? "",
    ),
    queryFn: () => scenesApi.getScene(localActiveSceneId!),
    enabled: !!localActiveSceneId && !!currentProject?.id,
    staleTime: 5 * 60 * 1000,
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

