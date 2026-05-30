/**
 * Variables API Client
 *
 * Client for variable management operations.
 * Variables are boolean variables used in conditional branching.
 */

import { request, requestVoid } from "./client";
import type { Variable } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateVariableBody {
  key: string;
  description?: string;
  category?: string;
}

export interface UpdateVariableBody {
  description?: string;
  category?: string;
}

export interface ListVariablesResponse {
  variables: Variable[];
}

export interface GetVariableResponse {
  variable: Variable;
}

// ============================================================================
// Variables API
// ============================================================================

export const variablesApi = {
  /**
   * List all variables for a project
   */
  async listVariables(projectId: string): Promise<Variable[]> {
    const response = await request<ListVariablesResponse>(
      `/projects/${encodeURIComponent(projectId)}/variables`,
      {
        method: "GET",
      }
    );
    return response.variables;
  },

  /**
   * Get a single variable by ID
   */
  async getVariable(variableId: string): Promise<Variable> {
    const response = await request<GetVariableResponse>(
      `/variables/${encodeURIComponent(variableId)}`,
      {
        method: "GET",
      }
    );
    return response.variable;
  },

  /**
   * Create a new variable for a project
   */
  async createVariable(
    projectId: string,
    body: CreateVariableBody
  ): Promise<Variable> {
    const response = await request<GetVariableResponse>(
      `/projects/${encodeURIComponent(projectId)}/variables`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.variable;
  },

  /**
   * Update an existing variable
   */
  async updateVariable(
    variableId: string,
    body: UpdateVariableBody
  ): Promise<Variable> {
    const response = await request<GetVariableResponse>(
      `/variables/${encodeURIComponent(variableId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    return response.variable;
  },

  /**
   * Delete a variable
   */
  async deleteVariable(variableId: string): Promise<void> {
    return requestVoid(`/variables/${encodeURIComponent(variableId)}`, {
      method: "DELETE",
    });
  },
};
