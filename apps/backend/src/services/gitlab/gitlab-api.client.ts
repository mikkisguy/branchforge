/**
 * GitLab API Client
 *
 * Low-level GitLab API HTTP client with SSRF protection via IP pinning,
 * URL allowlisting, manual redirect following, and configurable timeouts.
 */

import { pinnedHttpsRequest } from "../../lib/pinned-request.js";
import {
  isPrivateOrLocalHostname,
  isAllowedGitlabHost,
  resolvePublicHost,
} from "../../lib/ip-validation.js";
import { logSecurityEvent, LogEventType } from "../../lib/logger.js";

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum number of HTTP redirects to follow manually. Caps redirect
 * chains to bound latency and avoid loops.
 */
const MAX_REDIRECTS = 5;

/**
 * Validates a URL against the GitLab SSRF allowlist and returns a sanitized
 * URL string derived from the parsed `URL` object, or null if rejected.
 *
 * Returns the RECONSTRUCTED URL (`parsed.toString()`) rather than the raw
 * input for two reasons:
 *   1. Defense in depth — downstream consumers (fetch) operate on a value
 *      provably built from validated components: HTTPS scheme, non-private
 *      host, and an allowlisted GitLab host.
 *   2. It breaks the data-flow taint chain so static analysis (CodeQL
 *      `js/request-forgery`) recognizes the host check as a sanitizer,
 *      rather than seeing the user-provided string flow straight to fetch.
 *
 * Used to validate both the initial request URL and every redirect target,
 * so an attacker-controlled host in the allowlist cannot redirect a
 * PAT-bearing request to an internal address or the cloud-metadata endpoint.
 */
function approveGitlabUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHostname(hostname)) {
      return null;
    }
    if (!isAllowedGitlabHost(hostname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Fetch with timeout helper using AbortController.
 *
 * The initial URL AND every redirect `Location` are re-validated against
 * the GitLab SSRF allowlist (HTTPS, not private/local, allowlisted host)
 * before being fetched, so the request — and its `PRIVATE-TOKEN` header —
 * can never be diverted to a non-allowlisted or internal host. Redirects
 * are followed MANUALLY (never automatically).
 *
 * The initial-URL check is defense-in-depth: callers are expected to
 * pre-validate via `validateGitLabUrl`, but enforcing it at the fetch sink
 * ensures a future caller that skips validation still cannot exfiltrate
 * the token or pivot to an internal service.
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The fetch response
 * @throws Error if timeout occurs, too many redirects, or the URL or a
 *   redirect targets a non-allowlisted host.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const initialUrl = approveGitlabUrl(url);
  if (!initialUrl) {
    throw new Error(
      "Refused GitLab fetch to a non-allowlisted or internal host"
    );
  }
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Resolve DNS to a known-public IP and pin the TCP connection
      // to that exact IP via https.request's `lookup` option, closing
      // the DNS rebinding TOCTOU window: the hostname is never
      // re-resolved by the outbound transport.
      const parsedHost = new URL(currentUrl).hostname;
      const pinnedIps = await resolvePublicHost(parsedHost);
      if (!pinnedIps) {
        logSecurityEvent(LogEventType.SECURITY_SSRF_REFUSAL, {
          hostname: parsedHost,
        });
        throw new Error("Refused GitLab fetch to non-public IP");
      }
      const pinnedIp = pinnedIps[0];

      const parsedUrl = new URL(currentUrl);
      const requestHeaders: Record<string, string> = {};
      if (options.headers) {
        const h = options.headers as Record<string, string>;
        for (const [k, v] of Object.entries(h)) {
          requestHeaders[k] = v;
        }
      }

      const response = await pinnedHttpsRequest(
        {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
          method: (options.method as string) || "GET",
          headers: requestHeaders,
          body: options.body as string | undefined,
          signal: controller.signal,
        },
        pinnedIp
      );

      // Only follow real redirects (300-399 excluding 304 Not Modified
      // and 305 Use Proxy). If there is no Location header, surface the
      // response to the caller as-is.
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304 &&
        response.status !== 305
      ) {
        const location = response.headers.get("location");
        if (!location) {
          return response;
        }
        const nextUrl = approveGitlabUrl(
          new URL(location, currentUrl).toString()
        );
        if (!nextUrl) {
          throw new Error(
            "Refused to follow GitLab redirect to a non-allowlisted or internal host"
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error("Too many GitLab redirects");
}
