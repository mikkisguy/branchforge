/**
 * Encryption Service
 *
 * Provides AES-256-GCM encryption for secure storage of GitLab Personal Access Tokens (PAT).
 * Uses a 32-character encryption key from the ENCRYPTION_KEY environment variable.
 *
 * Security notes:
 * - Uses AES-256-GCM for authenticated encryption
 * - Each encryption uses a random IV (Initialization Vector)
 * - The authentication tag ensures data integrity
 * - Encrypted format: base64(iv:authTag:encryptedData)
 */

import crypto from "node:crypto";
import {
  isPrivateOrLocalHostname,
  isAllowedGitlabHost,
} from "../lib/ip-validation.js";

// GitLab PAT format: glpat- followed by alphanumeric characters, hyphens, underscores, and dots
const GITLAB_PAT_REGEX = /^glpat-[a-zA-Z0-9_.-]+$/;

// Default GitLab URL
const DEFAULT_GITLAB_URL = "https://gitlab.com";

/**
 * Validate and sanitize a GitLab URL to prevent SSRF attacks
 * @param gitlabUrl - The URL to validate
 * @returns The validated and normalized URL string, or default if invalid
 */
export function validateGitLabUrl(gitlabUrl?: string): string {
  const urlToCheck = gitlabUrl || DEFAULT_GITLAB_URL;

  try {
    const parsedUrl = new URL(urlToCheck);

    // Only allow HTTPS
    if (parsedUrl.protocol !== "https:") {
      return DEFAULT_GITLAB_URL;
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Reject IP addresses that are private/internal
    if (isPrivateOrLocalHostname(hostname)) {
      return DEFAULT_GITLAB_URL;
    }

    // Check if hostname is in the allowlist
    if (!isAllowedGitlabHost(hostname)) {
      return DEFAULT_GITLAB_URL;
    }

    // Return protocol + hostname, preserving the port if specified
    return parsedUrl.port
      ? `${parsedUrl.protocol}//${parsedUrl.hostname}:${parsedUrl.port}`
      : `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  } catch {
    // For URL parsing errors, fall back to default
    return DEFAULT_GITLAB_URL;
  }
}

/**
 * Validate GitLab Personal Access Token format
 * @param token - The token to validate
 * @returns true if token matches GitLab PAT format
 */
export function isValidPATFormat(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  return GITLAB_PAT_REGEX.test(token);
}

/**
 * Encrypt a GitLab PAT using AES-256-GCM
 * @param token - The PAT to encrypt
 * @returns Base64-encoded string containing IV, auth tag, and encrypted data
 * @throws Error if ENCRYPTION_KEY is not set or token format is invalid
 */
export function encryptPAT(token: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  if (!isValidPATFormat(token)) {
    throw new Error("Invalid GitLab PAT format");
  }

  // Derive a 32-byte key from the environment variable using SHA-256
  const key = crypto.createHash("sha256").update(encryptionKey).digest();

  // Generate a random IV (Initialization Vector)
  const iv = crypto.randomBytes(16);

  // Create cipher using AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  // Encrypt the token
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Combine IV, auth tag, and encrypted data, then encode as base64
  // Format: base64(iv:authTag:encryptedData)
  const combined = `${iv.toString("base64")}:${authTag.toString(
    "base64"
  )}:${encrypted}`;
  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypt a GitLab PAT that was encrypted with encryptPAT
 * @param encryptedToken - The encrypted token (base64-encoded)
 * @returns The original plaintext PAT
 * @throws Error if ENCRYPTION_KEY is not set or decryption fails
 */
export function decryptPAT(encryptedToken: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  try {
    // Derive the same 32-byte key used during encryption
    const key = crypto.createHash("sha256").update(encryptionKey).digest();

    // Decode the base64 to get the combined string
    const combined = Buffer.from(encryptedToken, "base64").toString("utf8");

    // Split into IV, auth tag, and encrypted data
    const parts = combined.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const [ivBase64, authTagBase64, encrypted] = parts;
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    // Create decipher using AES-256-GCM
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the token
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to decrypt PAT: ${error.message}`, {
        cause: error,
      });
    }
    throw new Error("Failed to decrypt PAT: Unknown error", { cause: error });
  }
}

/**
 * Validate a GitLab PAT by making an API call to GitLab
 * @param token - The PAT to validate
 * @param gitlabUrl - The GitLab instance URL (default: https://gitlab.com)
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns The username if valid, null otherwise
 */
export async function validateAndGetUsername(
  token: string,
  gitlabUrl: string = DEFAULT_GITLAB_URL,
  timeoutMs: number = 10000
): Promise<string | null> {
  // Validate format first
  if (!isValidPATFormat(token)) {
    return null;
  }

  // Validate and sanitize the GitLab URL to prevent SSRF
  const validatedUrl = validateGitLabUrl(gitlabUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL("/api/v4/user", validatedUrl);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "PRIVATE-TOKEN": token,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { username?: string } | undefined;
    return data?.username || null;
  } catch (error) {
    // AbortError is thrown when timeout expires
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
