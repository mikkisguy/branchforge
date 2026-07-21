/**
 * GitLab Integration Service
 *
 * Manages user GitLab integration records (PAT storage, retrieval, deletion).
 * The PAT is encrypted at rest via the encryption service.
 */

import { getDb } from "../../db/index.js";
import { gitlabIntegrations } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  validateAndGetUsername,
  encryptPAT,
  decryptPAT,
  validateGitLabUrl,
} from "../encryption.service.js";
import { ValidationError } from "../../middleware/error-handler.middleware.js";

/**
 * Validate a GitLab Personal Access Token by calling GitLab API
 * @param token - The PAT to validate
 * @param gitlabUrl - The GitLab instance URL (default: https://gitlab.com)
 * @returns The username if valid, null otherwise
 */
export async function validateGitlabPAT(
  token: string,
  gitlabUrl: string = "https://gitlab.com"
): Promise<string | null> {
  return validateAndGetUsername(token, gitlabUrl);
}

/**
 * Get a user's GitLab integration
 * @param userId - The user ID
 * @returns The integration record or null
 */
export async function getGitlabIntegration(userId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(gitlabIntegrations)
    .where(eq(gitlabIntegrations.userId, userId))
    .limit(1);

  return result[0] || null;
}

/**
 * Store or update a user's GitLab integration
 * Encrypts the PAT before storing
 * @param userId - The user ID
 * @param token - The GitLab PAT
 * @param gitlabUrl - The GitLab instance URL
 */
export async function storeGitlabIntegration(
  userId: string,
  token: string,
  gitlabUrl: string = "https://gitlab.com"
): Promise<void> {
  const db = getDb();

  // Validate token and get username
  const username = await validateGitlabPAT(token, gitlabUrl);
  if (!username) {
    throw new ValidationError("Invalid GitLab token");
  }

  // Sanitize the GitLab URL before storing
  const sanitizedGitlabUrl = validateGitLabUrl(gitlabUrl);

  // Encrypt the token
  const encryptedToken = encryptPAT(token);

  // Store or update using upsert
  await db
    .insert(gitlabIntegrations)
    .values({
      userId,
      encryptedToken,
      gitlabUrl: sanitizedGitlabUrl,
      username,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gitlabIntegrations.userId,
      set: {
        encryptedToken,
        gitlabUrl: sanitizedGitlabUrl,
        username,
        updatedAt: new Date(),
      },
    });
}

/**
 * Delete a user's GitLab integration
 * @param userId - The user ID
 */
export async function deleteGitlabIntegration(userId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(gitlabIntegrations)
    .where(eq(gitlabIntegrations.userId, userId));
}

/**
 * Get decrypted PAT for API calls
 * @param userId - The user ID
 * @returns The decrypted PAT or null
 * @throws Error if integration not found
 */
export async function getDecryptedToken(userId: string): Promise<string> {
  const integration = await getGitlabIntegration(userId);
  if (!integration) {
    throw new Error("GitLab integration not found");
  }
  return decryptPAT(integration.encryptedToken);
}
