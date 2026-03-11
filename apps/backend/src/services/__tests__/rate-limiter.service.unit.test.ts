import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getRateLimitInfo,
} from "../rate-limiter.service.js";

describe("Rate Limiter Service", () => {
  const testIdentifier = "192.168.1.1";
  const MAX_ATTEMPTS = 5;

  beforeEach(() => {
    // Clear the store before each test
    clearRateLimit(testIdentifier);
  });

  afterEach(() => {
    clearRateLimit(testIdentifier);
  });

  describe("checkRateLimit", () => {
    it("should allow first request", () => {
      const result = checkRateLimit(testIdentifier);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(MAX_ATTEMPTS - 1);
    });

    it("should allow requests up to the limit", () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const result = checkRateLimit(testIdentifier);
        expect(result.allowed).toBe(true);
      }
    });

    it("should block requests after limit is exceeded", () => {
      // Use up all attempts
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        checkRateLimit(testIdentifier);
      }

      // Next request should be blocked
      const result = checkRateLimit(testIdentifier);
      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should reset counter after time window expires", () => {
      // Use up all attempts
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        checkRateLimit(testIdentifier);
      }

      // Should be blocked
      let result = checkRateLimit(testIdentifier);
      expect(result.allowed).toBe(false);

      // Mock time passing (15 minutes + 1 second)
      vi.useFakeTimers();
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      // Should be allowed again
      result = checkRateLimit(testIdentifier);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(MAX_ATTEMPTS - 1);

      vi.useRealTimers();
    });

    it("should track remaining attempts correctly", () => {
      let result = checkRateLimit(testIdentifier);
      expect(result.remainingAttempts).toBe(4);

      result = checkRateLimit(testIdentifier);
      expect(result.remainingAttempts).toBe(3);

      result = checkRateLimit(testIdentifier);
      expect(result.remainingAttempts).toBe(2);
    });

    it("should handle multiple identifiers independently", () => {
      const ip1 = "192.168.1.1";
      const ip2 = "192.168.1.2";

      // Use up attempts for ip1
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        checkRateLimit(ip1);
      }

      // ip1 should be blocked
      let result = checkRateLimit(ip1);
      expect(result.allowed).toBe(false);

      // ip2 should still be allowed
      result = checkRateLimit(ip2);
      expect(result.allowed).toBe(true);
    });
  });

  describe("recordFailedAttempt", () => {
    it("should increment counter for existing entry", () => {
      // Make 4 attempts
      for (let i = 0; i < 4; i++) {
        checkRateLimit(testIdentifier);
      }

      const infoBefore = getRateLimitInfo(testIdentifier);
      expect(infoBefore?.count).toBe(4);

      // Record a failed attempt
      recordFailedAttempt(testIdentifier);

      const infoAfter = getRateLimitInfo(testIdentifier);
      expect(infoAfter?.count).toBe(5);
    });

    it("should do nothing if no entry exists", () => {
      // Don't call checkRateLimit first
      recordFailedAttempt(testIdentifier);

      const info = getRateLimitInfo(testIdentifier);
      expect(info).toBeUndefined();
    });
  });

  describe("clearRateLimit", () => {
    it("should remove rate limit entry", () => {
      // Use up all attempts
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        checkRateLimit(testIdentifier);
      }

      // Should be blocked
      let result = checkRateLimit(testIdentifier);
      expect(result.allowed).toBe(false);

      // Clear the rate limit
      clearRateLimit(testIdentifier);

      // Should be allowed again
      result = checkRateLimit(testIdentifier);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(MAX_ATTEMPTS - 1);
    });
  });

  describe("getRateLimitInfo", () => {
    it("should return rate limit info for existing entry", () => {
      checkRateLimit(testIdentifier);

      const info = getRateLimitInfo(testIdentifier);
      expect(info).toBeDefined();
      expect(info?.count).toBe(1);
      expect(info?.resetTime).toBeGreaterThan(Date.now());
    });

    it("should return undefined for non-existent entry", () => {
      const info = getRateLimitInfo(testIdentifier);
      expect(info).toBeUndefined();
    });
  });
});
