/**
 * Pair Groups API Client
 *
 * Client for pair group management operations.
 */

import { request } from "./client";
import type { PairGroup, PairGroupWithNames } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreatePairGroupBody {
  characterAId: string;
  characterBId: string;
  duoEndingLabel: string;
}

export interface UpdatePairGroupBody {
  duoEndingLabel?: string;
}

export interface GetPairGroupResponse {
  pairGroup: PairGroup;
}

export interface ListPairGroupsResponse {
  pairGroups: PairGroupWithNames[];
}

// ============================================================================
// API
// ============================================================================

export const pairGroupsApi = {
  async listPairGroups(projectId: string): Promise<PairGroupWithNames[]> {
    const response = await request<ListPairGroupsResponse>(
      `/projects/${projectId}/pairs`
    );
    return response.pairGroups;
  },

  async createPairGroup(
    projectId: string,
    body: CreatePairGroupBody
  ): Promise<PairGroup> {
    const response = await request<GetPairGroupResponse>(
      `/projects/${projectId}/pairs`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.pairGroup;
  },

  async updatePairGroup(
    projectId: string,
    pairGroupId: string,
    body: UpdatePairGroupBody
  ): Promise<PairGroup> {
    const response = await request<GetPairGroupResponse>(
      `/projects/${projectId}/pairs/${pairGroupId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
    return response.pairGroup;
  },

  async deletePairGroup(projectId: string, pairGroupId: string): Promise<void> {
    await request(`/projects/${projectId}/pairs/${pairGroupId}`, {
      method: "DELETE",
    });
  },
};
