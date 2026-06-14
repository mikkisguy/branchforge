/**
 * IP and hostname validation utilities
 *
 * Shared helpers for SSRF protection: checking private IP ranges,
 * local hostnames, and validating GitLab hostnames against the allowlist.
 */

import ipaddr from "ipaddr.js";

// Allowed GitLab hostnames (can be extended with environment variable)
const ALLOWED_GITLAB_HOSTS = new Set([
  "gitlab.com",
  ...(process.env.ALLOWED_GITLAB_HOSTS?.split(",").map((h) =>
    h.trim().toLowerCase()
  ) || []),
]);

/**
 * Check if an IP address is within a private/internal range using ipaddr.js
 * Handles both IPv4 and IPv6, including IPv4-mapped IPv6 addresses
 */
export function isPrivateIP(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    let range = addr.range();

    // Handle IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
    if (range === "ipv4Mapped" && addr instanceof ipaddr.IPv6) {
      const ipv4 = addr.toIPv4Address();
      range = ipv4.range();
    }

    return (
      range === "loopback" ||
      range === "private" ||
      range === "linkLocal" ||
      range === "reserved" ||
      range === "broadcast" ||
      range === "carrierGradeNat"
    );
  } catch {
    return false;
  }
}

/**
 * Check if a hostname is an IP address and whether it's private/internal
 * Handles IPv4 and IPv6 (including bracketed format like [::1])
 */
export function isPrivateOrLocalHostname(hostname: string): boolean {
  // Check for IPv6 addresses in URL format (bracketed)
  const ipv6InBrackets = hostname.match(/^\[([:0-9a-fA-F]+)\]$/);
  if (ipv6InBrackets) {
    return isPrivateIP(ipv6InBrackets[1]);
  }

  if (ipaddr.isValid(hostname)) {
    return isPrivateIP(hostname);
  }

  const lowerHostname = hostname.toLowerCase();
  if (
    lowerHostname === "localhost" ||
    lowerHostname.endsWith(".local") ||
    lowerHostname.endsWith(".localhost")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if a hostname is an allowed GitLab host
 *
 * Allows:
 * - gitlab.com (exact match)
 * - *.gitlab.io subdomains (for GitLab Pages instances)
 * - *.gitlab.com subdomains
 * - Any host added via ALLOWED_GITLAB_HOSTS env var
 */
export function isAllowedGitlabHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (ALLOWED_GITLAB_HOSTS.has(lower)) {
    return true;
  }

  if (lower.endsWith(".gitlab.io") || lower.endsWith(".gitlab.com")) {
    return true;
  }

  return false;
}
