/**
 * Writing Goals API Client
 *
 * Client for daily writing goal settings and statistics.
 */

import { request } from "./client";

// ============================================================================
// Types
// ============================================================================

interface DailyWordCount {
  date: string; // ISO date YYYY-MM-DD
  count: number;
}

export interface WritingGoalSettings {
  dailyWritingGoal: number | null;
  dailyWordResetHour: number;
  dailyWordCounts: DailyWordCount[];
  timezone: string;
}

export interface UpdateWritingGoalParams {
  dailyWritingGoal?: number | null;
  dailyWordResetHour?: number;
  timezone?: string;
}

export interface ResetWritingStatsResponse {
  success: boolean;
}

// ============================================================================
// Writing Goals API
// ============================================================================

export const writingGoalsApi = {
  /**
   * Get current user's writing goal settings
   */
  async getSettings(): Promise<WritingGoalSettings> {
    return await request<WritingGoalSettings>("/user/settings");
  },

  /**
   * Update current user's writing goal settings
   * Only fields that are provided will be updated.
   * Set dailyWritingGoal to null to disable the feature.
   */
  async updateGoal(
    params: UpdateWritingGoalParams
  ): Promise<WritingGoalSettings> {
    return await request<WritingGoalSettings>("/user/settings", {
      method: "PUT",
      body: JSON.stringify(params),
    });
  },

  /**
   * Reset writing statistics
   * Clears all daily word counts and per-label tracking.
   */
  async resetStats(): Promise<ResetWritingStatsResponse> {
    return await request<ResetWritingStatsResponse>(
      "/user/settings/reset-stats",
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );
  },
};
