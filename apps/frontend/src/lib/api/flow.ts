/**
 * Flow Graph API Client
 *
 * Client for flow graph visualization data and layout persistence.
 */

import { request } from "./client";
import type { FlowGraph, FlowGraphPositions } from "@branchforge/shared";

export const flowApi = {
  /**
   * Get flow graph data for a project
   */
  async getFlowGraph(projectId: string): Promise<FlowGraph> {
    return request<FlowGraph>(
      `/flow-graph?projectId=${encodeURIComponent(projectId)}`
    );
  },

  /**
   * Get saved layout positions for a project
   */
  async getFlowGraphLayout(
    projectId: string
  ): Promise<{ positions: FlowGraphPositions }> {
    return request<{ positions: FlowGraphPositions }>(
      `/flow-graph/layout?projectId=${encodeURIComponent(projectId)}`
    );
  },

  /**
   * Save layout positions for a project
   */
  async saveFlowGraphLayout(
    projectId: string,
    positions: FlowGraphPositions
  ): Promise<void> {
    await request<void>("/flow-graph/layout", {
      method: "PUT",
      body: JSON.stringify({ projectId, positions }),
    });
  },

  /**
   * Delete (reset) layout positions for a project
   */
  async deleteFlowGraphLayout(projectId: string): Promise<void> {
    await request<void>(
      `/flow-graph/layout?projectId=${encodeURIComponent(projectId)}`,
      { method: "DELETE" }
    );
  },
};
