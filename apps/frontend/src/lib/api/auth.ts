const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

import type { PublicUser } from "@branchforge/shared";

export interface AuthResponse {
  user: PublicUser | null;
}

export type { PublicUser };

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

// ============================================================================
// Validation Utilities
// ============================================================================

const VALIDATION_ERRORS = {
  EMAIL_REQUIRED: "Email is required",
  EMAIL_INVALID: "Please enter a valid email address",
  EMAIL_TOO_LONG: "Email is too long (maximum 254 characters)",
  PASSWORD_REQUIRED: "Password is required",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
  PASSWORD_TOO_LONG: "Password is too long (maximum 72 characters)",
  PASSWORD_INVALID_CHARS: "Password contains invalid characters",
};

/**
 * Validates an email address format
 */
function isValidEmail(email: string): boolean {
  // RFC 5322 compliant email regex (simplified version)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates password character set (printable ASCII, no control characters)
 */
function isValidPassword(password: string): boolean {
  // Allow printable ASCII characters (32-126) except potentially dangerous ones
  // Exclude: null bytes, control characters, angle brackets (XSS prevention)
  const passwordRegex = /^[\x20-\x7E]+$/;
  // Additional check for angle brackets
  const hasAngleBrackets = /[<>]/.test(password);
  return passwordRegex.test(password) && !hasAngleBrackets;
}

/**
 * Sanitizes email by trimming whitespace and converting to lowercase
 */
function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sanitizes password by trimming whitespace (but preserving internal spaces if valid)
 */
function sanitizePassword(password: string): string {
  return password.trim();
}

function validateEmail(email: string): void {
  if (!email || email.trim() === "") {
    throw new Error(VALIDATION_ERRORS.EMAIL_REQUIRED);
  }
  if (email.length > 254) {
    throw new Error(VALIDATION_ERRORS.EMAIL_TOO_LONG);
  }
  const sanitizedEmail = sanitizeEmail(email);
  if (!isValidEmail(sanitizedEmail)) {
    throw new Error(VALIDATION_ERRORS.EMAIL_INVALID);
  }
}

function validatePassword(
  password: string,
  options?: { minLength?: number }
): void {
  if (!password || password === "") {
    throw new Error(VALIDATION_ERRORS.PASSWORD_REQUIRED);
  }
  if (options?.minLength && password.length < options.minLength) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_TOO_SHORT);
  }
  if (password.length > 72) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_TOO_LONG);
  }
  if (!isValidPassword(password)) {
    throw new Error(VALIDATION_ERRORS.PASSWORD_INVALID_CHARS);
  }
}

/**
 * Validates login credentials
 * @throws Error with validation message if validation fails
 */
function validateLoginCredentials(credentials: LoginCredentials): void {
  validateEmail(credentials.email);
  validatePassword(credentials.password);
}

/**
 * Validates registration credentials
 * @throws Error with validation message if validation fails
 */
function validateRegisterCredentials(credentials: RegisterCredentials): void {
  validateEmail(credentials.email);
  validatePassword(credentials.password, { minLength: 8 });
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
// Auth API Methods
// ============================================================================

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Validate input before sending to backend
    validateLoginCredentials(credentials);

    // Sanitize input
    const sanitized = {
      email: sanitizeEmail(credentials.email),
      password: sanitizePassword(credentials.password),
    };

    return request<AuthResponse>("/login", {
      method: "POST",
      body: JSON.stringify(sanitized),
    });
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    // Validate input before sending to backend
    validateRegisterCredentials(credentials);

    // Sanitize input
    const sanitized = {
      email: sanitizeEmail(credentials.email),
      password: sanitizePassword(credentials.password),
    };

    return request<AuthResponse>("/register", {
      method: "POST",
      body: JSON.stringify(sanitized),
    });
  },

  async logout(): Promise<void> {
    return request<void>("/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async getMe(): Promise<AuthResponse> {
    return request<AuthResponse>("/me");
  },
};
