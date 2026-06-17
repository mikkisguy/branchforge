/**
 * Centralized Application Configuration
 *
 * Provides configuration values with validation to ensure
 * required environment variables are set.
 */

/**
 * Get the API base path for URL construction.
 *
 * @throws {Error} If BASE_PATH environment variable is not set
 * @returns The configured base path
 */
export function getBasePath(): string {
  const basePath = process.env.BASE_PATH?.trim();

  if (!basePath) {
    throw new Error(
      "BASE_PATH environment variable is required but not set. " +
        "Please set BASE_PATH in your environment."
    );
  }

  // Ensure consistent trailing slash
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

/**
 * Bounded session lifetime range, in milliseconds. A session shorter than
 * 1h is impractical for a creative app; one longer than 30d is an excessive
 * exposure window for a stolen cookie.
 */
const MIN_SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the configured session absolute lifetime (maxAge) in milliseconds.
 *
 * Reads SESSION_MAX_AGE (milliseconds) from the environment and clamps it
 * to the allowed [1h, 30d] range. Invalid or missing values fall back to
 * the 24-hour default. Self-hosters can tune this to their threat model:
 * shorter (e.g. 2h) for tighter security, longer (e.g. 7d) for personal
 * convenience. Combined with sliding expiry (rolling sessions), the value
 * also acts as an inactivity timeout.
 *
 * @returns A session maxAge in milliseconds, guaranteed to be within bounds.
 */
export function getSessionMaxAge(): number {
  const raw = process.env.SESSION_MAX_AGE;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_SESSION_MAX_AGE_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SESSION_MAX_AGE_MS;
  }
  return Math.min(
    MAX_SESSION_MAX_AGE_MS,
    Math.max(MIN_SESSION_MAX_AGE_MS, parsed)
  );
}
