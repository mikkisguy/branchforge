/**
 * Route Configurations API Client
 *
 * Client for route configuration management operations.
 * Routes are user-defined entities that replace hardcoded route enums.
 */

import { request, requestVoid } from "./client";
import type { RouteConfig } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateRouteConfigBody {
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  sortOrder?: number;
  isShared?: boolean;
}

export interface UpdateRouteConfigBody {
  routeName?: string;
  jumpPrefix?: string;
  sortOrder?: number;
  isShared?: boolean;
}

export interface ListRouteConfigsResponse {
  routeConfigs: RouteConfig[];
}

export interface GetRouteConfigResponse {
  routeConfig: RouteConfig;
}

// ============================================================================
// Route Configurations API
// ============================================================================

export const routeConfigsApi = {
  /**
   * List all route configurations for a project
   */
  async listRouteConfigs(projectId: string): Promise<RouteConfig[]> {
    const response = await request<ListRouteConfigsResponse>(
      `/projects/${encodeURIComponent(projectId)}/routes`,
      {
        method: "GET",
      }
    );
    return response.routeConfigs;
  },

  /**
   * Get a single route configuration by ID
   */
  async getRouteConfig(routeConfigId: string): Promise<RouteConfig> {
    const response = await request<GetRouteConfigResponse>(
      `/routes/${encodeURIComponent(routeConfigId)}`,
      {
        method: "GET",
      }
    );
    return response.routeConfig;
  },

  /**
   * Create a new route configuration for a project
   */
  async createRouteConfig(
    projectId: string,
    body: CreateRouteConfigBody
  ): Promise<RouteConfig> {
    const response = await request<GetRouteConfigResponse>(
      `/projects/${encodeURIComponent(projectId)}/routes`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.routeConfig;
  },

  /**
   * Update an existing route configuration
   */
  async updateRouteConfig(
    routeConfigId: string,
    body: UpdateRouteConfigBody
  ): Promise<RouteConfig> {
    const response = await request<GetRouteConfigResponse>(
      `/routes/${encodeURIComponent(routeConfigId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    return response.routeConfig;
  },

  /**
   * Delete a route configuration
   */
  async deleteRouteConfig(routeConfigId: string): Promise<void> {
    return requestVoid(`/routes/${encodeURIComponent(routeConfigId)}`, {
      method: "DELETE",
    });
  },
};
