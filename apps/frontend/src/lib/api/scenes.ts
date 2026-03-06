/**
 * Scenes API Client
 *
 * Client for scene management operations.
 */

import { request } from "./client";

// ============================================================================
// Types (imported from shared package)
// ============================================================================

// Import types from shared package - these match backend response types
import type {
  PublicScene,
  SceneDetail,
} from "@branchforge/shared";

export interface ListScenesParams {
  projectId: string;
  route?: string;
  status?: string;
}

export interface ListScenesResponse {
  scenes: PublicScene[];
}

export interface GetSceneResponse {
  scene: SceneDetail;
}

// ============================================================================
// Scenes API
// ============================================================================

export const scenesApi = {
  /**
   * List scenes for a project with optional filtering
   */
  async listScenes(params: ListScenesParams): Promise<PublicScene[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("projectId", params.projectId);
    if (params.route) searchParams.set("route", params.route);
    if (params.status) searchParams.set("status", params.status);

    const response = await request<ListScenesResponse>(
      `/scenes?${searchParams.toString()}`,
    );
    return response.scenes;
  },

  /**
   * Get a single scene by ID with full details (lines and characters)
   */
  async getScene(sceneId: string): Promise<SceneDetail> {
    const response = await request<GetSceneResponse>(`/scenes/${sceneId}`);
    return response.scene;
  },
};
