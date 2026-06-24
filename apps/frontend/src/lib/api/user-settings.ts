/**
 * User Settings API Client
 *
 * Client for user profile, avatar, and writing goal settings.
 */

import { request } from "./client";

// ============================================================================
// Types
// ============================================================================

export interface UserSettings {
  avatarUrl: string | null;
  username: string | null;
  language: string;
  theme: string;
  dailyWritingGoal: number | null;
  dailyWordResetHour: number;
  dailyWordCounts: Array<{ date: string; count: number }>;
  timezone: string;
}

export interface UpdateUserProfileParams {
  username?: string;
  language?: string;
  theme?: string;
}

export interface UpdateWritingGoalParams {
  dailyWritingGoal?: number | null;
  dailyWordResetHour?: number;
  timezone?: string;
}

export interface UploadAvatarResponse {
  avatarUrl: string;
}

export interface ResetWritingStatsResponse {
  success: boolean;
}

// ============================================================================
// User Settings API
// ============================================================================

export const userSettingsApi = {
  /**
   * Get current user's settings (includes profile, avatar, and writing goals)
   */
  async getSettings(): Promise<UserSettings> {
    return await request<UserSettings>("/user/settings");
  },

  /**
   * Update current user's profile settings
   * Only fields that are provided will be updated.
   */
  async updateProfile(params: UpdateUserProfileParams): Promise<UserSettings> {
    return await request<UserSettings>("/user/settings/profile", {
      method: "PUT",
      body: JSON.stringify(params),
    });
  },

  /**
   * Update current user's writing goal settings
   * Only fields that are provided will be updated.
   * Set dailyWritingGoal to null to disable the feature.
   */
  async updateWritingGoals(
    params: UpdateWritingGoalParams
  ): Promise<UserSettings> {
    return await request<UserSettings>("/user/settings", {
      method: "PUT",
      body: JSON.stringify(params),
    });
  },

  /**
   * Upload user avatar
   */
  async uploadAvatar(file: File): Promise<UploadAvatarResponse> {
    const formData = new FormData();
    formData.append("avatar", file);

    return await request<UploadAvatarResponse>("/user/settings/avatar", {
      method: "POST",
      body: formData,
    });
  },

  /**
   * Delete user avatar
   */
  async deleteAvatar(): Promise<void> {
    await request<void>("/user/settings/avatar", {
      method: "DELETE",
    });
  },

  /**
   * Reset writing statistics
   * Clears all daily word counts and per-label tracking.
   */
  async resetWritingStats(): Promise<ResetWritingStatsResponse> {
    return await request<ResetWritingStatsResponse>(
      "/user/settings/reset-stats",
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );
  },
};
