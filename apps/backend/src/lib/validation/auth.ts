/**
 * Auth Validation Schemas
 *
 * Registration and login request validation.
 */

import { z } from "zod";
import { emailSchema, passwordSchema } from "./common.js";

/**
 * Registration request validation
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login request validation
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
