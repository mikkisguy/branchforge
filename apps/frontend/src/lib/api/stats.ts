import { request, requestVoid } from "./client";
import type { Stat, StatProgression } from "@branchforge/shared";

export interface CreateStatBody {
  key: string;
  name: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface UpdateStatBody {
  name?: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface ListStatsResponse {
  stats: Stat[];
}

export interface GetStatResponse {
  stat: Stat;
}

export interface GetProgressionResponse {
  progression: StatProgression[];
}

export const statsApi = {
  async listStats(projectId: string): Promise<Stat[]> {
    const response = await request<ListStatsResponse>(
      `/projects/${encodeURIComponent(projectId)}/stats`,
      { method: "GET" }
    );
    return response.stats;
  },

  async createStat(projectId: string, body: CreateStatBody): Promise<Stat> {
    const response = await request<GetStatResponse>(
      `/projects/${encodeURIComponent(projectId)}/stats`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return response.stat;
  },

  async updateStat(statId: string, body: UpdateStatBody): Promise<Stat> {
    const response = await request<GetStatResponse>(
      `/stats/${encodeURIComponent(statId)}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
    return response.stat;
  },

  async deleteStat(statId: string): Promise<void> {
    return requestVoid(`/stats/${encodeURIComponent(statId)}`, {
      method: "DELETE",
    });
  },

  async getProgression(projectId: string): Promise<StatProgression[]> {
    const response = await request<GetProgressionResponse>(
      `/projects/${encodeURIComponent(projectId)}/stats/progression`,
      { method: "GET" }
    );
    return response.progression;
  },
};
