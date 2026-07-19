/**
 * Session Data Validation Schemas
 *
 * Validates session data with whitelisted keys and size limits.
 */

import { z } from "zod";

// CSRF double-submit token support: the `csrfToken` key is whitelisted
// here so the session-store Zod schema accepts it. The token itself is
// minted by `generateCsrfToken` in `middleware/csrf.middleware.ts` on
// login and validated globally by `validateCsrfToken` (registered as a
// preValidation hook in `index.ts`). See GitHub issue #206.
export const ALLOWED_SESSION_KEYS = [
  "user",
  "csrfToken", // issued on login, sent back as x-csrf-token on state-changing requests
  "flash",
  "returnTo",
] as const;

/**
 * Allowed primitive value types for session data
 */
const allowedPrimitiveSchema = z.union([
  z.string().max(4096, "Session value string too long"),
  z.number(),
  z.boolean(),
  z.null(),
]);

/**
 * Nested session value schema
 * Limits to 50 keys, each key max 100 chars, values must be primitives
 */
const nestedSessionValueSchema = z.record(
  z.string().max(100, "Session key too long"),
  allowedPrimitiveSchema
);

/**
 * Session data schema
 * Validates top-level keys against whitelist, applies size limits
 * Whitelisted keys can have nested objects (with size limits) or primitive values
 */
export const sessionDataSchema = z
  .partialRecord(
    z.enum(ALLOWED_SESSION_KEYS),
    z.union([nestedSessionValueSchema, allowedPrimitiveSchema])
  )
  .refine(
    (data) => {
      for (const value of Object.values(data)) {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const nested = value as Record<string, unknown>;
          if (Object.keys(nested).length > 50) {
            return false;
          }
          for (const nestedKey of Object.keys(nested)) {
            if (nestedKey.length > 100) {
              return false;
            }
          }
        }
      }
      return true;
    },
    { message: "Session validation failed" }
  );

export type SessionData = z.infer<typeof sessionDataSchema>;
