/**
 * Ren'Py Definitions API Client
 *
 * Client for Ren'Py definition management operations.
 * Ren'Py definitions are static declarations for export to RPY files.
 */

import { request, requestVoid } from "./client";
import type {
  RenpyDefinition,
  RenpyDefinitionCategory,
} from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateRenpyDefinitionBody {
  category: RenpyDefinitionCategory;
  tag: string;
  displayName: string;
  definitionCode: string;
  referenceTag?: string | null;
  sortOrder?: number;
}

export interface UpdateRenpyDefinitionBody {
  category?: RenpyDefinitionCategory;
  tag?: string;
  displayName?: string;
  definitionCode?: string;
  referenceTag?: string | null;
  sortOrder?: number;
}

export interface ListRenpyDefinitionsResponse {
  renpyDefinitions: RenpyDefinition[];
}

export interface GetRenpyDefinitionResponse {
  renpyDefinition: RenpyDefinition;
}

// ============================================================================
// Ren'Py Definitions API
// ============================================================================

export const renpyDefinitionsApi = {
  /**
   * List all Ren'Py definitions for a project
   */
  async listRenpyDefinitions(projectId: string): Promise<RenpyDefinition[]> {
    const response = await request<ListRenpyDefinitionsResponse>(
      `/projects/${encodeURIComponent(projectId)}/renpy-definitions`,
      {
        method: "GET",
      }
    );
    return response.renpyDefinitions;
  },

  /**
   * Get a single Ren'Py definition by ID
   */
  async getRenpyDefinition(
    renpyDefinitionId: string
  ): Promise<RenpyDefinition> {
    const response = await request<GetRenpyDefinitionResponse>(
      `/renpy-definitions/${encodeURIComponent(renpyDefinitionId)}`,
      {
        method: "GET",
      }
    );
    return response.renpyDefinition;
  },

  /**
   * Create a new Ren'Py definition for a project
   */
  async createRenpyDefinition(
    projectId: string,
    body: CreateRenpyDefinitionBody
  ): Promise<RenpyDefinition> {
    const response = await request<GetRenpyDefinitionResponse>(
      `/projects/${encodeURIComponent(projectId)}/renpy-definitions`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.renpyDefinition;
  },

  /**
   * Update an existing Ren'Py definition
   */
  async updateRenpyDefinition(
    renpyDefinitionId: string,
    body: UpdateRenpyDefinitionBody
  ): Promise<RenpyDefinition> {
    const response = await request<GetRenpyDefinitionResponse>(
      `/renpy-definitions/${encodeURIComponent(renpyDefinitionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    return response.renpyDefinition;
  },

  /**
   * Delete a Ren'Py definition
   */
  async deleteRenpyDefinition(renpyDefinitionId: string): Promise<void> {
    return requestVoid(
      `/renpy-definitions/${encodeURIComponent(renpyDefinitionId)}`,
      {
        method: "DELETE",
      }
    );
  },
};
