/**
 * Flow Graph API Client
 *
 * Client for flow graph visualization data and layout persistence.
 *
 * Layout positions are scoped to a mode (FLOW / ROUTE / FILE) end-to-end:
 * the backend stores one row per (project, user, mode), and the client
 * always passes the active mode so reads, writes, and resets stay
 * isolated.
 */

import { request } from "./client";
import type {
  FlowGraph,
  FlowGraphPositions,
  FlowLayoutMode,
} from "@branchforge/shared";

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
   * Get saved layout positions for a project, scoped to a layout mode.
   */
  async getFlowGraphLayout(
    projectId: string,
    mode: FlowLayoutMode
  ): Promise<{ positions: FlowGraphPositions }> {
    return request<{ positions: FlowGraphPositions }>(
      `/flow-graph/layout?projectId=${encodeURIComponent(projectId)}&mode=${mode}`
    );
  },

  /**
   * Save layout positions for a project, scoped to a layout mode.
   */
  async saveFlowGraphLayout(
    projectId: string,
    mode: FlowLayoutMode,
    positions: FlowGraphPositions
  ): Promise<void> {
    await request<void>("/flow-graph/layout", {
      method: "PUT",
      body: JSON.stringify({ projectId, mode, positions }),
    });
  },

  /**
   * Delete (reset) layout positions for a project, scoped to a layout
   * mode. Resetting one mode leaves positions in other modes intact.
   */
  async deleteFlowGraphLayout(
    projectId: string,
    mode: FlowLayoutMode
  ): Promise<void> {
    await request<void>(
      `/flow-graph/layout?projectId=${encodeURIComponent(projectId)}&mode=${mode}`,
      { method: "DELETE" }
    );
  },
};
