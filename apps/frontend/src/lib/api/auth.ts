const API_BASE = import.meta.env.VITE_API_ENV === "development" ? "/api/api" : "/api";

export type UserRole = "OWNER" | "READER" | "TESTER";

export interface AuthResponse {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
}

export interface ApiError {
  error: string;
}

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
    const error: ApiError = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return request<AuthResponse>("/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    return request<AuthResponse>("/register", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  async logout(): Promise<void> {
    return request<void>("/logout", {
      method: "POST",
    });
  },

  async getMe(): Promise<AuthResponse> {
    return request<AuthResponse>("/me");
  },
};
