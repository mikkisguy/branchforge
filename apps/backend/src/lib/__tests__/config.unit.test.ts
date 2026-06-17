/**
 * Configuration Unit Tests
 *
 * Tests for bounded, environment-driven configuration helpers in src/lib/config.ts.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { getSessionMaxAge } from "../config.js";

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
