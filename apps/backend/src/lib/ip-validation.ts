/**
 * IP and hostname validation utilities
 *
 * Shared helpers for SSRF protection: checking private IP ranges,
 * local hostnames, and validating GitLab hostnames against the allowlist.
 */

import { promises as dns } from "node:dns";
import ipaddr from "ipaddr.js";

// DNS resolution timeout for isValidPublicHost (ms)
const DNS_RESOLVE_TIMEOUT_MS = 5000;

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
      range === "carrierGradeNat" ||
      range === "uniqueLocal" ||
      range === "multicast"
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
 * - *.gitlab.com subdomains
 * - Any host added via ALLOWED_GITLAB_HOSTS env var
 *
 * NOTE: *.gitlab.io subdomains are NOT unconditionally allowed.
 * GitLab Pages sites are user-controlled static sites, not API
 * instances. To allow a specific *.gitlab.io host, add it via
 * the ALLOWED_GITLAB_HOSTS environment variable.
 */
export function isAllowedGitlabHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (ALLOWED_GITLAB_HOSTS.has(lower)) {
    return true;
  }

  if (lower.endsWith(".gitlab.com")) {
    return true;
  }

  return false;
}

/**
 * Resolve a hostname to IP addresses and check that none are private.
 *
 * Uses `dns.resolve4` / `dns.resolve6` (c-ares, non-blocking) rather than
 * `dns.lookup` to avoid threadpool pressure and `/etc/hosts` bypasses.
 * Queries both address families in parallel and rejects the host if ANY
 * resolved address is private, link-local, ULA, or multicast.
 *
 * Must be called immediately before making an outbound HTTP request
 * to prevent DNS rebinding attacks where a hostname's A/AAAA records
 * are changed between hostname-only validation and the actual fetch.
 *
 * @returns true if all resolved addresses are public, false on DNS
 *   failure, timeout, or if any resolved IP is private.
 */
export async function isValidPublicHost(hostname: string): Promise<boolean> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => resolve("timeout"), DNS_RESOLVE_TIMEOUT_MS);
    });

    const resolve = (async () => {
      const [v4, v6] = await Promise.allSettled([
        dns.resolve4(hostname),
        dns.resolve6(hostname),
      ]);
      const addresses = [
        ...(v4.status === "fulfilled" ? v4.value : []),
        ...(v6.status === "fulfilled" ? v6.value : []),
      ];
      if (addresses.length === 0) return false;
      return addresses.every((ip) => !isPrivateIP(ip));
    })();

    const result = await Promise.race([resolve, timeout]);
    return result === "timeout" ? false : result;
  } catch {
    return false;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
