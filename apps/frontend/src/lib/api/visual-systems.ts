/**
 * Visual Systems API Client
 *
 * Client for the per-project visual system configuration. The
 * visual system controls how generated Ren'Py visual filenames
 * are produced (template tokens, group prefixes, padding).
 */

import { request } from "./client";
import type { VisualSystemConfig } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

/**
 * Partial update payload. Every field is optional — the server
 * PATCHes only what you send, leaving other fields alone.
 */
export type UpdateVisualSystemConfigBody = Partial<VisualSystemConfig>;

// ============================================================================
// Visual Systems API
// ============================================================================

export const visualSystemsApi = {
  /**
   * Get the visual system config for a project.
   *
   * Auto-creates a default row on first read.
   */
  async getVisualSystemConfig(projectId: string): Promise<VisualSystemConfig> {
    return await request<VisualSystemConfig>(
      `/projects/${encodeURIComponent(projectId)}/visual-system`,
      {
        method: "GET",
      }
    );
  },

  /**
   * Update (PATCH) the visual system config for a project.
   *
   * Only the fields you include in the body are written.
   */
  async updateVisualSystemConfig(
    projectId: string,
    body: UpdateVisualSystemConfigBody
  ): Promise<VisualSystemConfig> {
    return await request<VisualSystemConfig>(
      `/projects/${encodeURIComponent(projectId)}/visual-system`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
  },
};
