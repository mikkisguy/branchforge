const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

interface ApiError {
  error: string;
}

// ============================================================================
// API Request Handler
// ============================================================================

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ApiError = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      error.error || `Request failed with status ${response.status}`
    );
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// Types
// ============================================================================

export interface SignUpStatusResponse {
  enabled: boolean;
}

export interface SettingResponse {
  key: string;
  value: unknown;
}

export interface AllSettingsResponse {
  settings: Record<string, unknown>;
}

// ============================================================================
// Settings API Methods
// ============================================================================

export const settingsApi = {
  async getSignUpStatus(): Promise<SignUpStatusResponse> {
    return request<SignUpStatusResponse>("/public/settings/signups");
  },

  async getAllSettings(): Promise<AllSettingsResponse> {
    return request<AllSettingsResponse>("/admin/settings");
  },

  async updateSetting(key: string, value: unknown): Promise<SettingResponse> {
    return request<SettingResponse>(`/admin/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
  },
};
