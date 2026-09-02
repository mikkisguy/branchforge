/**
 * Configuration Unit Tests
 *
 * Tests for bounded, environment-driven configuration helpers in src/lib/config.ts.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { getSessionMaxAge, getTrustProxy } from "../config.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe("getSessionMaxAge", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.SESSION_MAX_AGE;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SESSION_MAX_AGE;
    } else {
      process.env.SESSION_MAX_AGE = original;
    }
  });

  it("returns the 24h default when SESSION_MAX_AGE is unset", () => {
    delete process.env.SESSION_MAX_AGE;
    expect(getSessionMaxAge()).toBe(ONE_DAY_MS);
  });

  it("returns the 24h default when SESSION_MAX_AGE is empty/whitespace", () => {
    process.env.SESSION_MAX_AGE = "   ";
    expect(getSessionMaxAge()).toBe(ONE_DAY_MS);
  });

  it("returns a valid in-range value unchanged", () => {
    process.env.SESSION_MAX_AGE = String(2 * ONE_HOUR_MS); // 2 hours
    expect(getSessionMaxAge()).toBe(2 * ONE_HOUR_MS);
  });

  it("returns the boundary minimum (1h) unchanged", () => {
    process.env.SESSION_MAX_AGE = String(ONE_HOUR_MS);
    expect(getSessionMaxAge()).toBe(ONE_HOUR_MS);
  });

  it("returns the boundary maximum (30d) unchanged", () => {
    process.env.SESSION_MAX_AGE = String(THIRTY_DAYS_MS);
    expect(getSessionMaxAge()).toBe(THIRTY_DAYS_MS);
  });

  it("clamps a sub-minimum value up to 1h", () => {
    process.env.SESSION_MAX_AGE = String(60 * 1000); // 1 minute
    expect(getSessionMaxAge()).toBe(ONE_HOUR_MS);
  });

  it("clamps an over-maximum value down to 30d", () => {
    process.env.SESSION_MAX_AGE = String(365 * ONE_DAY_MS); // 1 year
    expect(getSessionMaxAge()).toBe(THIRTY_DAYS_MS);
  });

  it("falls back to the default for non-numeric input", () => {
    process.env.SESSION_MAX_AGE = "not-a-number";
    expect(getSessionMaxAge()).toBe(ONE_DAY_MS);
  });

  it("falls back to the default for partially numeric input", () => {
    // parseInt("123abc", 10) would silently return 123; Number() returns NaN.
    process.env.SESSION_MAX_AGE = "123abc";
    expect(getSessionMaxAge()).toBe(ONE_DAY_MS);
  });

  it("falls back to the default for zero or negative values", () => {
    process.env.SESSION_MAX_AGE = "0";
    expect(getSessionMaxAge()).toBe(ONE_DAY_MS);

    process.env.SESSION_MAX_AGE = "-3600000";
    expect(getSessionMaxAge()).toBe(ONE_DAY_MS);
  });

  it("parses a 7-day value correctly (common self-hosted setting)", () => {
    process.env.SESSION_MAX_AGE = String(7 * ONE_DAY_MS);
    expect(getSessionMaxAge()).toBe(7 * ONE_DAY_MS);
  });
});

describe("getTrustProxy", () => {
  let original: string | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    original = process.env.TRUST_PROXY;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (original === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = original;
    }
  });

  it("defaults to loopback when TRUST_PROXY is unset", () => {
    delete process.env.TRUST_PROXY;
    expect(getTrustProxy()).toBe("loopback");
  });

  it("defaults to loopback when TRUST_PROXY is empty/whitespace", () => {
    process.env.TRUST_PROXY = "   ";
    expect(getTrustProxy()).toBe("loopback");
  });

  it.each(["loopback", "linklocal", "uniquelocal"] as const)(
    "passes through the %s keyword",
    (keyword) => {
      process.env.TRUST_PROXY = keyword;
      expect(getTrustProxy()).toBe(keyword);
    }
  );

  it("parses true as boolean true and warns that it is permissive", () => {
    process.env.TRUST_PROXY = "true";
    expect(getTrustProxy()).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/spoof X-Forwarded-For/);
  });

  it("parses false as boolean false without warning", () => {
    process.env.TRUST_PROXY = "false";
    expect(getTrustProxy()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("parses a purely numeric string as a hop count", () => {
    process.env.TRUST_PROXY = "1";
    expect(getTrustProxy()).toBe(1);

    process.env.TRUST_PROXY = "2";
    expect(getTrustProxy()).toBe(2);
  });

  it("parses a hop count surrounded by whitespace", () => {
    process.env.TRUST_PROXY = "  1  ";
    expect(getTrustProxy()).toBe(1);
  });

  it("returns a single IP as a string", () => {
    process.env.TRUST_PROXY = "172.31.0.1";
    expect(getTrustProxy()).toBe("172.31.0.1");
  });

  it("returns a comma-separated IP and CIDR list as a trimmed array", () => {
    process.env.TRUST_PROXY = "172.31.0.1, 10.8.0.0/24";
    expect(getTrustProxy()).toEqual(["172.31.0.1", "10.8.0.0/24"]);
  });

  it("warns when TRUST_PROXY is the catch-all CIDR 0.0.0.0/0", () => {
    process.env.TRUST_PROXY = "0.0.0.0/0";
    expect(getTrustProxy()).toBe("0.0.0.0/0");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/spoof X-Forwarded-For/);
  });

  it("throws listing whitespace-only entries in a comma list", () => {
    process.env.TRUST_PROXY = "172.31.0.1,  ,10.8.0.0/24";
    expect(() => getTrustProxy()).toThrow(/invalid entries: ""/);
  });

  it("throws listing garbage entries rather than passing them through", () => {
    process.env.TRUST_PROXY = "172.31.0.1,not-an-ip,10.8.0.0/24";
    expect(() => getTrustProxy()).toThrow(/invalid entries: "not-an-ip"/);
  });

  it("throws for a single unrecognizable value", () => {
    process.env.TRUST_PROXY = "not-a-proxy";
    expect(() => getTrustProxy()).toThrow(/invalid entries: "not-a-proxy"/);
  });

  it("honors X-Forwarded-Proto from a trusted Docker-gateway IP", async () => {
    process.env.TRUST_PROXY = "172.31.0.1";
    const app = Fastify({ logger: false, trustProxy: getTrustProxy() });
    app.get("/proto", async (request) => ({ protocol: request.protocol }));
    await app.ready();

    const trusted = await app.inject({
      method: "GET",
      url: "/proto",
      remoteAddress: "172.31.0.1",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(JSON.parse(trusted.payload).protocol).toBe("https");

    const untrusted = await app.inject({
      method: "GET",
      url: "/proto",
      remoteAddress: "203.0.113.10",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(JSON.parse(untrusted.payload).protocol).toBe("http");

    await app.close();
  });
});
