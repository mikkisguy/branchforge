/**
 * State Variables API Client
 *
 * Client for state variable management operations.
 * State variables are boolean state variables used in conditional branching.
 */

import { request, requestVoid } from "./client";
import type { StateVariable } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateStateVariableBody {
  key: string;
  description?: string;
  category?: string;
}

export interface UpdateStateVariableBody {
  key?: string;
  description?: string;
  category?: string;
}

export interface ListStateVariablesResponse {
  stateVariables: StateVariable[];
}

export interface GetStateVariableResponse {
  stateVariable: StateVariable;
}

// ============================================================================
// State Variables API
// ============================================================================

export const stateVariablesApi = {
  /**
   * List all state variables for a project
   */
  async listStateVariables(projectId: string): Promise<StateVariable[]> {
    const response = await request<ListStateVariablesResponse>(
      `/projects/${encodeURIComponent(projectId)}/state-variables`,
      {
        method: "GET",
      }
    );
    return response.stateVariables;
  },

  /**
   * Get a single state variable by ID
   */
  async getStateVariable(stateVariableId: string): Promise<StateVariable> {
    const response = await request<GetStateVariableResponse>(
      `/state-variables/${encodeURIComponent(stateVariableId)}`,
      {
        method: "GET",
      }
    );
    return response.stateVariable;
  },

  /**
   * Create a new state variable for a project
   */
  async createStateVariable(
    projectId: string,
    body: CreateStateVariableBody
  ): Promise<StateVariable> {
    const response = await request<GetStateVariableResponse>(
      `/projects/${encodeURIComponent(projectId)}/state-variables`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.stateVariable;
  },

  /**
   * Update an existing state variable
   */
  async updateStateVariable(
    stateVariableId: string,
    body: UpdateStateVariableBody
  ): Promise<StateVariable> {
    const response = await request<GetStateVariableResponse>(
      `/state-variables/${encodeURIComponent(stateVariableId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    return response.stateVariable;
  },

  /**
   * Delete a state variable
   */
  async deleteStateVariable(stateVariableId: string): Promise<void> {
    return requestVoid(
      `/state-variables/${encodeURIComponent(stateVariableId)}`,
      {
        method: "DELETE",
      }
    );
  },
};
