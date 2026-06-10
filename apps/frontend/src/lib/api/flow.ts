/**
 * Flow Graph API Client
 *
 * Client for flow graph visualization data.
 */

import { request } from "./client";
import type { FlowGraph } from "@branchforge/shared";

export const flowApi = {
  /**
   * Get flow graph data for a project
   */
  async getFlowGraph(projectId: string): Promise<FlowGraph> {
    return request<FlowGraph>(
      `/flow-graph?projectId=${encodeURIComponent(projectId)}`
    );
  },
};
