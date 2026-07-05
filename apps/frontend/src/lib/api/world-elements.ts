/**
 * World Elements API Client
 *
 * Client for world element management operations.
 * World elements are world bible entries: locations, items, concepts, events.
 */

import { request, requestVoid } from "./client";
import type { WorldElement } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateWorldElementBody {
  name: string;
  type: "LOCATION" | "ITEM" | "CONCEPT" | "EVENT";
  description?: string;
  tags?: string[];
}

export interface UpdateWorldElementBody {
  name?: string;
  type?: "LOCATION" | "ITEM" | "CONCEPT" | "EVENT";
  description?: string;
  tags?: string[];
}

export interface ListWorldElementsResponse {
  elements: WorldElement[];
}

export interface GetWorldElementResponse {
  element: WorldElement;
}

// ============================================================================
// World Elements API
// ============================================================================

export const worldElementsApi = {
  /**
   * List all world elements for a project
   */
  async listWorldElements(projectId: string): Promise<WorldElement[]> {
    const response = await request<ListWorldElementsResponse>(
      `/projects/${encodeURIComponent(projectId)}/world-elements`,
      {
        method: "GET",
      }
    );
    return response.elements;
  },

  /**
   * Get a single world element by ID
   */
  async getWorldElement(elementId: string): Promise<WorldElement> {
    const response = await request<GetWorldElementResponse>(
      `/world-elements/${encodeURIComponent(elementId)}`,
      {
        method: "GET",
      }
    );
    return response.element;
  },

  /**
   * Create a new world element for a project
   */
  async createWorldElement(
    projectId: string,
    body: CreateWorldElementBody
  ): Promise<WorldElement> {
    const response = await request<GetWorldElementResponse>(
      `/projects/${encodeURIComponent(projectId)}/world-elements`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.element;
  },

  /**
   * Update an existing world element
   */
  async updateWorldElement(
    elementId: string,
    body: UpdateWorldElementBody
  ): Promise<WorldElement> {
    const response = await request<GetWorldElementResponse>(
      `/world-elements/${encodeURIComponent(elementId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    return response.element;
  },

  /**
   * Delete a world element
   */
  async deleteWorldElement(elementId: string): Promise<void> {
    return requestVoid(`/world-elements/${encodeURIComponent(elementId)}`, {
      method: "DELETE",
    });
  },
};
