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
  // Use Number() instead of parseInt: parseInt silently truncates partially
  // numeric values (e.g. "123abc" -> 123), whereas Number() returns NaN for
  // any non-fully-numeric input, falling through to the default below.
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SESSION_MAX_AGE_MS;
  }
  return Math.min(
    MAX_SESSION_MAX_AGE_MS,
    Math.max(MIN_SESSION_MAX_AGE_MS, parsed)
  );
}

/**
 * Fastify `trustProxy` values that can be expressed via TRUST_PROXY.
 * Function form is not supported through the environment.
 */
export type TrustProxySetting = boolean | string | string[];

const DEFAULT_TRUST_PROXY = "loopback";
const TRUST_PROXY_KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

// Loose address/CIDR shapes. Octet ranges are not strictly checked —
// Fastify/proxy-addr will reject truly unusable values at request time.
const IPV4_OR_CIDR = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
const IPV6_OR_CIDR = /^\[?[0-9a-fA-F:.]+\]?(?:\/\d{1,3})?$/;

const PERMISSIVE_TRUST_PROXY_WARNING =
  "TRUST_PROXY is set to a value that lets clients spoof X-Forwarded-For " +
  "(true or 0.0.0.0/0). Use a specific proxy IP or CIDR unless you accept " +
  "that risk.";

function isLooseAddressOrCidr(entry: string): boolean {
  if (entry === "" || /\s/.test(entry)) {
    return false;
  }
  if (TRUST_PROXY_KEYWORDS.has(entry)) {
    return true;
  }
  if (IPV4_OR_CIDR.test(entry)) {
    return true;
  }
  // Require a colon so bare hex is not treated as IPv6.
  return entry.includes(":") && IPV6_OR_CIDR.test(entry);
}

function formatInvalidTrustProxyEntries(entries: string[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join(", ");
}

function warnIfPermissiveTrustProxy(value: boolean | string | string[]): void {
  const permissive =
    value === true ||
    value === "0.0.0.0/0" ||
    (Array.isArray(value) && value.includes("0.0.0.0/0"));
  if (permissive) {
    console.warn(PERMISSIVE_TRUST_PROXY_WARNING);
  }
}

/**
 * Get Fastify's `trustProxy` setting from the TRUST_PROXY environment
 * variable.
 *
 * Unset or empty defaults to `"loopback"` (backwards-compatible).
 * Accepted values:
 * - `"loopback"`, `"linklocal"`, `"uniquelocal"` — Fastify keywords
 * - `"true"` / `"false"` — boolean trust-all / trust-none
 * - a single IP or CIDR, or a comma-separated list of them
 *
 * Numeric hop-count values are rejected. Fastify 5.12.1+ disabled hop-count
 * trust because it cannot validate the connecting address and lets clients
 * spoof `X-Forwarded-*` headers.
 *
 * Overly permissive values (`true`, `0.0.0.0/0`) are allowed but log a
 * startup warning: they let clients spoof `X-Forwarded-For`.
 *
 * @throws {Error} If TRUST_PROXY contains empty, numeric, or unrecognizable entries
 * @returns A value suitable for Fastify's `trustProxy` option
 */
export function getTrustProxy(): TrustProxySetting {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TRUST_PROXY;
  }

  const value = raw.trim();

  if (value === "true") {
    warnIfPermissiveTrustProxy(true);
    return true;
  }
  if (value === "false") {
    return false;
  }

  if (TRUST_PROXY_KEYWORDS.has(value)) {
    return value;
  }

  // Pure digits are the old hop-count form. Fastify 5.12.1+ disabled it
  // because it cannot validate the connecting address (CVE-2026-16732).
  if (/^\d+$/.test(value)) {
    throw new Error(
      "TRUST_PROXY hop-count values are not supported. " +
        "Set TRUST_PROXY to a proxy IP, CIDR, or a Fastify keyword " +
        "(loopback, linklocal, uniquelocal)."
    );
  }

  const entries = value.includes(",")
    ? value.split(",").map((entry) => entry.trim())
    : [value];

  const invalid = entries.filter((entry) => !isLooseAddressOrCidr(entry));
  if (invalid.length > 0) {
    throw new Error(
      "TRUST_PROXY contains invalid entries: " +
        `${formatInvalidTrustProxyEntries(invalid)}. ` +
        "Each entry must be an IP address or CIDR " +
        "(e.g. 172.31.0.1 or 10.8.0.0/24)."
    );
  }

  const parsed: string | string[] = entries.length === 1 ? entries[0] : entries;
  warnIfPermissiveTrustProxy(parsed);
  return parsed;
}
