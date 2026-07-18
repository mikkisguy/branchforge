/**
 * Connection-pinned HTTPS request helper for SSRF protection.
 *
 * Uses `https.request` with a custom `lookup` function to pin the
 * TCP connection to a pre-resolved IP address, closing the DNS
 * rebinding TOCTOU window between hostname validation and the
 * outbound call. The original hostname is preserved for TLS SNI
 * and the Host header.
 */

import https from "node:https";

export interface PinnedRequestOptions {
  hostname: string;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  signal?: AbortSignal;
}

/**
 * Make an HTTPS request pinned to a specific IP address.
 *
 * The TCP connection goes to `pinnedIp`, while the `hostname` is used
 * for TLS SNI (server name indication) and the HTTP Host header.
 * Unlike `fetch()`, the hostname is never re-resolved by the transport.
 */
export async function pinnedHttpsRequest(
  options: PinnedRequestOptions,
  pinnedIp: string
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        hostname: options.hostname,
        path: options.path,
        method: options.method || "GET",
        headers: options.headers,
        lookup: (_hostname, _opts, cb) => cb(null, pinnedIp, 4),
        signal: options.signal,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined && value !== null) {
              responseHeaders.set(
                key,
                Array.isArray(value) ? value.join(", ") : String(value)
              );
            }
          }
          resolve(
            new Response(body, {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: responseHeaders,
            })
          );
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}
