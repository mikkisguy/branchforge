/**
 * API Client
 *
 * Shared HTTP client for API requests with consistent error handling,
 * credentials management, and response type safety.
 */

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
  details?: unknown;
}

interface ZodIssueLike {
  path?: unknown;
  message?: unknown;
}

interface ZodErrorLike {
  issues?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toReadableField(path: unknown): string {
  if (!Array.isArray(path) || path.length === 0) {
    return "Field";
  }

  const segments: string[] = [];
  for (const segment of path) {
    const trimmed = String(segment).trim();
    if (trimmed.length > 0) {
      segments.push(trimmed);
    }
  }
  const joined = segments.join(".");

  if (joined.length === 0) {
    return "Field";
  }

  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

function getFirstValidationIssue(errorData: Partial<ApiError> | undefined): {
  field: string;
  message: string;
} | null {
  if (!errorData || !isObject(errorData.details)) {
    return null;
  }

  const details = errorData.details;

  // Try Zod-style error format first (issues array)
  const zodError = details as ZodErrorLike;
  if (Array.isArray(zodError.issues) && zodError.issues.length > 0) {
    const firstIssue = zodError.issues[0] as ZodIssueLike;
    if (isObject(firstIssue) && typeof firstIssue.message === "string") {
      return {
        field: toReadableField(firstIssue.path),
        message: firstIssue.message,
      };
    }
  }

  // Try flattened validation map format (object with field names as keys)
  if (!Array.isArray(details)) {
    for (const [key, value] of Object.entries(details)) {
      // Skip known non-field keys
      if (key === "issues" || key === "_errors" || key === "message") {
        continue;
      }

      // Check if the value is a string or array of strings (validation message)
      if (typeof value === "string") {
        return {
          field: toReadableField([key]),
          message: value,
        };
      }

      if (
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === "string"
      ) {
        return {
          field: toReadableField([key]),
          message: value.join(", "),
        };
      }
    }
  }

  return null;
}

export function getApiErrorMessage(
  errorData: Partial<ApiError> | undefined,
  status: number
): string {
  const firstIssue = getFirstValidationIssue(errorData);
  if (firstIssue) {
    return `${firstIssue.field}: ${firstIssue.message}`;
  }

  return (
    errorData?.message ||
    errorData?.error ||
    `Request failed with status ${status}`
  );
}

export class ApiRequestError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.data = data;
  }
}

// ============================================================================
// API Request Handler
// ============================================================================

/**
 * Internal fetch implementation shared by all request variants
 */
async function fetchInternal(
  endpoint: string,
  options: RequestInit = {},
  allowConflict = false
): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;

  // Don't set Content-Type for FormData - let browser set it with proper boundary
  const isFormData = options.body instanceof FormData;
  const hasBody = options.body !== undefined && options.body !== null;

  let headers: HeadersInit | undefined = options.headers;

  // Only set JSON Content-Type when a request actually has a body.
  // Sending Content-Type: application/json with an empty body causes
  // Fastify to reject the request with FST_ERR_CTP_EMPTY_JSON_BODY.
  if (!isFormData && hasBody) {
    // Headers can be Headers, array, or plain object - handle each type
    if (headers instanceof Headers) {
      // Headers instance - check using has() method
      if (!headers.has("Content-Type")) {
        const nextHeaders = new Headers(headers);
        nextHeaders.set("Content-Type", "application/json");
        headers = nextHeaders;
      }
    } else if (Array.isArray(headers)) {
      // Array format: [["key", "value"], ...] - check case-insensitively
      const hasContentType = headers.some(
        ([key]) => key.toLowerCase() === "content-type"
      );
      headers = hasContentType
        ? headers
        : [["Content-Type", "application/json"], ...headers];
    } else {
      // Plain object: { key: "value", ... } - check case-insensitively
      const hasContentType =
        headers &&
        Object.keys(headers).some(
          (key) => key.toLowerCase() === "content-type"
        );
      headers = hasContentType
        ? headers
        : { "Content-Type": "application/json", ...(headers ?? {}) };
    }
  }

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    // Don't throw error for 409 Conflict if allowConflict is true
    if (allowConflict && response.status === 409) {
      return response;
    }

    const errorData: ApiError = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiRequestError(
      getApiErrorMessage(errorData, response.status),
      response.status,
      errorData
    );
  }

  return response;
}

// Overload for endpoints that return void (204 No Content)
export async function request(
  endpoint: string,
  options?: RequestInit,
  allowConflict?: boolean
): Promise<void>;

// Overload for endpoints that return data
export async function request<T>(
  endpoint: string,
  options?: RequestInit,
  allowConflict?: boolean
): Promise<T>;

// Implementation
export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  allowConflict = false
): Promise<T | void> {
  const response = await fetchInternal(endpoint, options, allowConflict);

  // For 204 No Content responses, return void
  if (response.status === 204) {
    return;
  }

  return response.json().catch(() => {
    throw new Error("Failed to parse response as JSON");
  });
}

/**
 * Request handler for endpoints that return 204 No Content.
 *
 * Use this for DELETE, PUT, or POST endpoints that don't return a response body.
 * Provides clear intent and avoids the need for explicit type parameters.
 *
 * @example
 * await requestVoid('/projects/123', { method: 'DELETE' });
 */
export async function requestVoid(
  endpoint: string,
  options: RequestInit = {}
): Promise<void> {
  await fetchInternal(endpoint, options);
  // No need to check 204 status - fetchInternal already validates the response
}
