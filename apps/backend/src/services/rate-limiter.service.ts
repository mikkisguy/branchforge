/**
 * Rate Limiter Service
 *
 * In-memory rate limiting to prevent brute-force attacks on login.
 * Tracks failed login attempts by IP address.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Configuration
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // Clean up expired entries every minute

// Store: IP address -> { count, resetTime }
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval reference for graceful shutdown
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Clean up expired entries from the rate limit store
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Start periodic cleanup
 */
function startCleanup(): void {
  if (cleanupInterval) {
    return; // Already started
  }

  cleanupInterval = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

  // Unref to allow Node.js to exit if only this timer is keeping it alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

// Start cleanup on module load
startCleanup();

export interface RateLimitOptions {
  maxAttempts?: number;
  windowMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = MAX_ATTEMPTS;
const DEFAULT_WINDOW_MS = WINDOW_MS;

/**
 * Check if a request from the given IP should be rate limited
 *
 * @param identifier - IP address or other identifier to rate limit by
 * @param options - Optional override of max attempts and window size
 * @returns Object with { allowed: boolean, remainingAttempts: number }
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfter?: number;
} {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // No previous attempts, or window has expired
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remainingAttempts: maxAttempts - 1,
    };
  }

  // Within the window, check if limit exceeded
  if (entry.count >= maxAttempts) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter,
    };
  }

  // Increment counter
  entry.count++;
  return {
    allowed: true,
    remainingAttempts: maxAttempts - entry.count,
  };
}

/**
 * Record a failed login attempt for rate limiting
 *
 * @param identifier - IP address or other identifier
 */
export function recordFailedAttempt(identifier: string): void {
  const entry = rateLimitStore.get(identifier);
  if (entry) {
    entry.count++;
  }
}

/**
 * Clear rate limit for a specific identifier
 * Useful for testing or when a user successfully logs in
 *
 * @param identifier - IP address or other identifier
 */
export function clearRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Get rate limit info for debugging
 *
 * @param identifier - IP address or other identifier
 */
export function getRateLimitInfo(identifier: string):
  | {
      count: number;
      resetTime: number;
    }
  | undefined {
  return rateLimitStore.get(identifier);
}

/**
 * Get the current size of the rate limit store
 * Useful for monitoring and testing
 *
 * @returns The number of entries in the rate limit store
 */
export function getRateLimiterSize(): number {
  return rateLimitStore.size;
}

/**
 * Get the cleanup interval (for testing and shutdown)
 *
 * @returns The cleanup interval or null if not started
 */
export function getRateLimiterInterval(): ReturnType<
  typeof setInterval
> | null {
  return cleanupInterval;
}

/**
 * Clean up rate limiter resources
 * Stops the cleanup interval and clears all entries
 * Should be called during graceful shutdown
 */
export function cleanupRateLimiter(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  rateLimitStore.clear();
}
