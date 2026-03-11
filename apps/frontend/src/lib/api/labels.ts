/**
 * Labels API Client
 *
 * Client for label management operations.
 */

import { request } from "./client";

// ============================================================================
// Types (imported from shared package)
// ============================================================================

// Import types from shared package - these match backend response types
import type { PublicLabel, LabelDetail } from "@branchforge/shared";

export interface ListLabelsParams {
  projectId: string;
  routeKey?: string;
  status?: string;
}

export interface ListLabelsResponse {
  labels: PublicLabel[];
}

export interface GetLabelResponse {
  label: LabelDetail;
}

// ============================================================================
// Labels API
// ============================================================================

export const labelsApi = {
  /**
   * List labels for a project with optional filtering
   */
  async listLabels(params: ListLabelsParams): Promise<PublicLabel[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("projectId", params.projectId);
    if (params.routeKey) searchParams.set("routeKey", params.routeKey);
    if (params.status) searchParams.set("status", params.status);

    const response = await request<ListLabelsResponse>(
      `/labels?${searchParams.toString()}`
    );
    return response.labels;
  },

  /**
   * Get a single label by ID with full details (lines and characters)
   */
  async getLabel(labelId: string): Promise<LabelDetail> {
    const response = await request<GetLabelResponse>(`/labels/${labelId}`);
    return response.label;
  },
};
