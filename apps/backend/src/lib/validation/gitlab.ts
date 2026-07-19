/**
 * GitLab Validation Schemas
 *
 * Request validation for GitLab integration, import/export,
 * conflict detection, and repository operations.
 */

import { z } from "zod";
import {
  uuidSchema,
  nonEmptyStringSchema,
  requiredString,
  optionalString,
  FILE_CONTENT_MAX_SIZE,
} from "./common.js";
import { conflictResolutionSchema } from "./enums.js";
import {
  isPrivateOrLocalHostname,
  isAllowedGitlabHost,
} from "../ip-validation.js";

/**
 * GitLab URL validation (with SSRF protection)
 *
 * The `isPrivateOrLocalHostname` helper (imported from
 * ../ip-validation.js) uses ipaddr.js to correctly block all of
 * 172.16.0.0/12, 100.64.0.0/10, IPv6 link-local, IPv4-mapped IPv6,
 * etc. — the prior substring-based filter missed most of these.
 */
export const gitlabUrlSchema = z
  .string()
  .url("Invalid URL format")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return !isPrivateOrLocalHostname(parsed.hostname);
      } catch {
        return false;
      }
    },
    { message: "Private/local URLs are not allowed" }
  )
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === "https:";
        const isAllowedHost = isAllowedGitlabHost(parsed.hostname);
        return isHttps && isAllowedHost;
      } catch {
        return false;
      }
    },
    {
      message: "Only HTTPS URLs to gitlab.com or GitLab instances are allowed",
    }
  );

/**
 * GitLab token validation
 * Shared between create integration and token validation schemas
 */
const gitlabTokenSchema = nonEmptyStringSchema
  .min(20, "Access token is too short")
  .max(100, "Access token is too long");

/**
 * Shared branch-name validation
 * Only allows /^[a-zA-Z0-9_/$.-]+$/, no leading `-` or `/`, no trailing `/`, no `..`.
 */
const gitBranchNameSchema = z
  .string()
  .min(1, "Branch is required")
  .max(255, "Branch name is too long")
  .regex(/^[a-zA-Z0-9_/$.-]+$/, "Branch name contains invalid characters")
  .refine(
    (name) =>
      !name.startsWith("-") &&
      !name.startsWith("/") &&
      !name.endsWith("/") &&
      !name.includes(".."),
    "Branch name cannot start with '-' or '/', end with '/', or contain '..'"
  );

/**
 * GitLab integration request validation
 */
export const createGitLabIntegrationSchema = z
  .object({
    projectId: uuidSchema,
    gitlabUrl: gitlabUrlSchema,
    accessToken: gitlabTokenSchema,
    branchName: gitBranchNameSchema,
  })
  .strict();

export type CreateGitLabIntegrationInput = z.infer<
  typeof createGitLabIntegrationSchema
>;

/**
 * Import project request validation
 */
export const importProjectSchema = z
  .object({
    projectName: requiredString(200, "Project name is too long"),
    projectDescription: optionalString(2000, "Project description is too long"),
    gitlabProjectId: z
      .number()
      .int()
      .positive("GitLab project ID must be positive"),
    gitlabProjectName: requiredString(500, "GitLab project name is too long"),
    branch: gitBranchNameSchema,
    conflictResolution: conflictResolutionSchema,
  })
  .strict();

export type ImportProjectInput = z.infer<typeof importProjectSchema>;

/**
 * GitLab file content update request validation (Script Mode editing)
 * Mirrors updateFileContentSchema but without expectedContentHash, because
 * the GitLab sync path tracks conflicts via a separate in-flight mechanism
 * (see updateGitLabFileContent service).
 */
export const updateGitLabFileContentSchema = z
  .object({
    content: z
      .string()
      .min(1, "File content is required")
      .max(FILE_CONTENT_MAX_SIZE, "File content too large (max 10MB)"),
  })
  .strict();

export type UpdateGitLabFileContentInput = z.infer<
  typeof updateGitLabFileContentSchema
>;

/**
 * GitLab export request validation
 */
export const exportToGitlabSchema = z
  .object({
    projectId: uuidSchema,
    branch: gitBranchNameSchema.optional(),
    commitMessage: z
      .string()
      .min(1, "Commit message is required")
      .max(500, "Commit message is too long"),
  })
  .strict();

export type ExportToGitlabInput = z.infer<typeof exportToGitlabSchema>;

// ============================================================================
// Additional GitLab Schemas (Wave 2 — VULN-003)
// ============================================================================

/** Validate a GitLab token + optional URL. Reuse for /gitlab/validate and /gitlab/integration. */
export const validateGitlabTokenSchema = z
  .object({
    token: gitlabTokenSchema,
    gitlabUrl: gitlabUrlSchema.optional(),
  })
  .strict();

export type ValidateGitlabTokenInput = z.infer<
  typeof validateGitlabTokenSchema
>;

/** GET /gitlab/files/:projectId query: branch required. */
export const gitLabFileListQuerySchema = z
  .object({
    branch: gitBranchNameSchema,
  })
  .strict();

export type GitLabFileListQuery = z.infer<typeof gitLabFileListQuerySchema>;

/** POST /gitlab/link body. */
export const linkRepositorySchema = z
  .object({
    projectId: uuidSchema,
    gitlabProjectId: z
      .number()
      .int()
      .positive("GitLab project ID must be positive"),
    branch: gitBranchNameSchema.optional(),
  })
  .strict();

export type LinkRepositoryInput = z.infer<typeof linkRepositorySchema>;

/** POST /gitlab/import body. */
export const importFromGitlabSchema = z
  .object({
    projectId: uuidSchema,
    branch: gitBranchNameSchema,
    conflictResolution: conflictResolutionSchema,
  })
  .strict();

export type ImportFromGitlabInput = z.infer<typeof importFromGitlabSchema>;

/** POST /gitlab/detect-conflicts body. */
export const detectConflictsSchema = z
  .object({
    projectId: uuidSchema,
    branch: gitBranchNameSchema,
  })
  .strict();

export type DetectConflictsInput = z.infer<typeof detectConflictsSchema>;

/** GET /gitlab/operations/:operationId params. */
export const operationIdParamsSchema = z
  .object({
    operationId: uuidSchema,
  })
  .strict();

export type OperationIdParams = z.infer<typeof operationIdParamsSchema>;
