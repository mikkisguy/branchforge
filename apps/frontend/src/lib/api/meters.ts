/**
 * Meters API Client
 *
 * Client for meter management operations.
 */

import { request, requestVoid } from "./client";
import type { Meter, MeterProgression } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface CreateMeterBody {
  key: string;
  name: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface UpdateMeterBody {
  name?: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface ListMetersResponse {
  meters: Meter[];
}

export interface GetMeterResponse {
  meter: Meter;
}

export interface GetProgressionResponse {
  progression: MeterProgression[];
}

// ============================================================================
// Meters API
// ============================================================================

export const metersApi = {
  /** List all meters for a project */
  async listMeters(projectId: string): Promise<Meter[]> {
    const response = await request<ListMetersResponse>(
      `/projects/${encodeURIComponent(projectId)}/meters`,
      { method: "GET" }
    );
    return response.meters;
  },

  /** Create a new meter */
  async createMeter(
    projectId: string,
    body: CreateMeterBody
  ): Promise<Meter> {
    const response = await request<GetMeterResponse>(
      `/projects/${encodeURIComponent(projectId)}/meters`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return response.meter;
  },

  /** Update an existing meter */
  async updateMeter(
    meterId: string,
    body: UpdateMeterBody
  ): Promise<Meter> {
    const response = await request<GetMeterResponse>(
      `/meters/${encodeURIComponent(meterId)}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
    return response.meter;
  },

  /** Delete a meter */
  async deleteMeter(meterId: string): Promise<void> {
    return requestVoid(`/meters/${encodeURIComponent(meterId)}`, {
      method: "DELETE",
    });
  },

  /** Get progression data for all meters */
  async getProgression(projectId: string): Promise<MeterProgression[]> {
    const response = await request<GetProgressionResponse>(
      `/projects/${encodeURIComponent(projectId)}/meters/progression`,
      { method: "GET" }
    );
    return response.progression;
  },
};
