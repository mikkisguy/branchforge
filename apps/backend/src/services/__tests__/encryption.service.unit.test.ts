/**
 * Encryption Service Tests
 *
 * Unit tests for AES-256-GCM encryption service used for GitLab PAT storage.
 * Tests are written before implementation (TDD approach).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock DNS-based SSRF guard so tests don't require real DNS resolution.
// The hostname-level guards (isPrivateOrLocalHostname, isAllowedGitlabHost)
// are tested separately in validation.unit.test.ts; this mock only ensures
// the resolved-IP check doesn't block mocked fetch calls.
vi.mock("../../lib/ip-validation.js", () => ({
  isPrivateIP: vi.fn(() => false),
  isPrivateOrLocalHostname: vi.fn(() => false),
  isAllowedGitlabHost: vi.fn(() => true),
  resolvePublicHost: vi.fn(() => Promise.resolve(["8.8.8.8"])),
}));

// Mock pinnedHttpsRequest so the test controls the response without
// real network calls or DNS resolution.
vi.mock("../../lib/pinned-request.js", () => ({
  pinnedHttpsRequest: vi.fn(),
}));

import {
  encryptPAT,
  decryptPAT,
  isValidPATFormat,
  validateAndGetUsername,
} from "../encryption.service.js";
import * as pinnedRequest from "../../lib/pinned-request.js";
import * as ipValidation from "../../lib/ip-validation.js";

describe("EncryptionService", () => {
  const testToken = "glpat-123456789abcdefghijklmn";
  const testGitlabUrl = "https://gitlab.com";

  describe("isValidPATFormat", () => {
    it("should return true for valid GitLab PAT format", () => {
      expect(isValidPATFormat("glpat-123456789abcdefghijklmn")).toBe(true);
      expect(isValidPATFormat("glpat-abc123")).toBe(true);
      expect(isValidPATFormat("glpat-test")).toBe(true);
    });

    it("should return false for invalid GitLab PAT formats", () => {
      expect(isValidPATFormat("github-token")).toBe(false);
      expect(isValidPATFormat("glpat_123")).toBe(false); // underscore instead of hyphen
      expect(isValidPATFormat("glpat")).toBe(false); // no characters after prefix
      expect(isValidPATFormat("")).toBe(false);
      expect(isValidPATFormat("random-string")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isValidPATFormat("glpat-")).toBe(false);
      expect(isValidPATFormat("glpat-123-456")).toBe(true); // hyphens in token are allowed
      expect(
        isValidPATFormat("glpat-test_token_with.underscores.and.dots")
      ).toBe(true); // underscores and dots are allowed
      expect(isValidPATFormat("glpat-test_token")).toBe(true); // underscores in token are allowed
      expect(isValidPATFormat("glpat-test.token")).toBe(true); // dots in token are allowed
      expect(isValidPATFormat(null as any)).toBe(false);
      expect(isValidPATFormat(undefined as any)).toBe(false);
    });
  });

  describe("encryptPAT", () => {
    beforeEach(() => {
      // Ensure encryption key is set for tests
      if (!process.env.ENCRYPTION_KEY) {
        process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";
      }
    });

    it("should encrypt a valid PAT", () => {
      const encrypted = encryptPAT(testToken);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testToken);
      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it("should produce different encrypted values for the same input (due to random IV)", () => {
      const encrypted1 = encryptPAT(testToken);
      const encrypted2 = encryptPAT(testToken);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should throw an error if ENCRYPTION_KEY is not set", () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => encryptPAT(testToken)).toThrow(
        "ENCRYPTION_KEY environment variable is not set"
      );

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("should throw an error if PAT format is invalid", () => {
      expect(() => encryptPAT("invalid-token")).toThrow(
        "Invalid GitLab PAT format"
      );
      expect(() => encryptPAT("")).toThrow("Invalid GitLab PAT format");
    });
  });

  describe("decryptPAT", () => {
    beforeEach(() => {
      if (!process.env.ENCRYPTION_KEY) {
        process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";
      }
    });

    it("should decrypt an encrypted PAT back to original", () => {
      const encrypted = encryptPAT(testToken);
      const decrypted = decryptPAT(encrypted);

      expect(decrypted).toBe(testToken);
    });

    it("should handle multiple encrypt/decrypt cycles", () => {
      const encrypted1 = encryptPAT(testToken);
      const decrypted1 = decryptPAT(encrypted1);

      const encrypted2 = encryptPAT(decrypted1);
      const decrypted2 = decryptPAT(encrypted2);

      expect(decrypted2).toBe(testToken);
    });

    it("should throw an error for invalid encrypted data format", () => {
      expect(() => decryptPAT("not-valid-encrypted-data")).toThrow();
      expect(() => decryptPAT("")).toThrow();
      expect(() => decryptPAT("invalid:base64:data")).toThrow();
    });

    it("should throw an error if encrypted data is corrupted", () => {
      const encrypted = encryptPAT(testToken);
      const corrupted = encrypted.slice(0, -5) + "corrupt";

      expect(() => decryptPAT(corrupted)).toThrow();
    });

    it("should throw an error if ENCRYPTION_KEY is not set", () => {
      const encrypted = encryptPAT(testToken);
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => decryptPAT(encrypted)).toThrow(
        "ENCRYPTION_KEY environment variable is not set"
      );

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("should throw an error if authentication tag verification fails", () => {
      // Encrypt with one key
      process.env.ENCRYPTION_KEY = "first-key-32-chars-long!!!!!!!";
      const encrypted = encryptPAT(testToken);

      // Try to decrypt with a different key
      process.env.ENCRYPTION_KEY = "second-key-32-chars-long!!!!!!";

      expect(() => decryptPAT(encrypted)).toThrow();

      // Restore original key
      process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";
    });
  });

  describe("validateAndGetUsername", () => {
    const validPat = "glpat-123456789abcdefghijklmn";
    const expectedUsername = "testuser";

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should validate token and return username for valid GitLab PAT", async () => {
      // Mock successful GitLab API response
      vi.mocked(pinnedRequest.pinnedHttpsRequest).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: expectedUsername }),
      } as Response);

      const result = await validateAndGetUsername(validPat, testGitlabUrl);

      expect(pinnedRequest.pinnedHttpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "gitlab.com",
          path: "/api/v4/user",
          method: "GET",
          headers: {
            "PRIVATE-TOKEN": validPat,
          },
        }),
        "8.8.8.8"
      );
      expect(result).toBe(expectedUsername);
    });

    it("should return null for invalid PAT (401 unauthorized)", async () => {
      // Mock unauthorized GitLab API response
      vi.mocked(pinnedRequest.pinnedHttpsRequest).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await validateAndGetUsername(validPat, testGitlabUrl);

      expect(result).toBeNull();
    });

    it("should return null for invalid token format", async () => {
      const result = await validateAndGetUsername(
        "invalid-token",
        testGitlabUrl
      );

      expect(result).toBeNull();
      // Request should not be made for invalid format
      expect(pinnedRequest.pinnedHttpsRequest).not.toHaveBeenCalled();
    });

    it("should return null for empty token", async () => {
      const result = await validateAndGetUsername("", testGitlabUrl);

      expect(result).toBeNull();
      // Request should not be made for empty token
      expect(pinnedRequest.pinnedHttpsRequest).not.toHaveBeenCalled();
    });

    it("should return null when API response lacks username", async () => {
      // Mock successful response but without username field
      vi.mocked(pinnedRequest.pinnedHttpsRequest).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 123, name: "Test User" }),
      } as Response);

      const result = await validateAndGetUsername(validPat, testGitlabUrl);

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      // Mock network error
      vi.mocked(pinnedRequest.pinnedHttpsRequest).mockRejectedValueOnce(
        new Error("Network error")
      );

      const result = await validateAndGetUsername(validPat, testGitlabUrl);

      expect(result).toBeNull();
    });

    it("should return null on timeout", async () => {
      // Mock AbortError for timeout
      const abortError = new Error("Request timeout");
      abortError.name = "AbortError";
      vi.mocked(pinnedRequest.pinnedHttpsRequest).mockRejectedValueOnce(
        abortError
      );

      const result = await validateAndGetUsername(validPat, testGitlabUrl);

      expect(result).toBeNull();
    });

    it("should return null when resolver refuses the host", async () => {
      vi.mocked(ipValidation.resolvePublicHost).mockResolvedValueOnce(null);

      const result = await validateAndGetUsername(validPat, testGitlabUrl);

      expect(result).toBeNull();
      expect(pinnedRequest.pinnedHttpsRequest).not.toHaveBeenCalled();
    });
  });

  describe("end-to-end encryption workflow", () => {
    beforeEach(() => {
      if (!process.env.ENCRYPTION_KEY) {
        process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";
      }
    });

    it("should successfully encrypt and decrypt realistic PATs", () => {
      const realisticPATs = [
        "glpat-example-token-replace-with-real-one",
        "glpat-test123abcdefghijklmnopqrstuvwxyz",
        "glpat-demo-token-for-testing-only",
      ];

      realisticPATs.forEach((pat) => {
        const encrypted = encryptPAT(pat);
        const decrypted = decryptPAT(encrypted);

        expect(decrypted).toBe(pat);
        expect(encrypted).not.toBe(pat);
      });
    });

    it("should not leak any part of the original token in encrypted output", () => {
      const encrypted = encryptPAT(testToken);

      // Ensure none of the original token appears in the encrypted output
      expect(encrypted).not.toContain("glpat");
      expect(encrypted).not.toContain("123456789");
      expect(encrypted).not.toContain("abcdefghijklmn");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
