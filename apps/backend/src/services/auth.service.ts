/**
 * Authentication Service
 *
 * Handles password hashing, user registration, and credential validation.
 */

import bcrypt from "bcrypt";
import { getDb } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { isSignUpsEnabled } from "./admin-settings.service.js";
import type { PublicUser } from "@branchforge/shared";

export type { PublicUser };

// Email regex for basic validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Minimum password length
const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Validate a password against a hash
 */
export async function validatePassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password) {
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * Register a new user (only allowed once - single user setup)
 */
export async function register(
  email: string,
  password: string
): Promise<PublicUser> {
  // Validate email format
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new Error("Invalid email format");
  }

  // Validate password strength
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Password must be at least 8 characters");
  }

  const db = getDb();

  // Check if signups are enabled
  if (!(await isSignUpsEnabled())) {
    throw new Error("Registration is currently disabled");
  }

  // Check if email is already registered
  const emailExists = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (emailExists.length > 0) {
    throw new Error("Email already registered");
  }

  // Hash the password
  const passwordHash = await hashPassword(password);

  // Create the user
  const result = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role: "OWNER",
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  if (result.length === 0) {
    throw new Error("Failed to create user");
  }

  const user = result[0];
  return {
    id: user.id,
    email: user.email,
    role: user.role ?? "OWNER",
  };
}

/**
 * Validate user credentials for login
 */
export async function validateCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const db = getDb();

  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, email));

  if (result.length === 0) {
    return null;
  }

  const user = result[0];
  const isValid = await validatePassword(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role ?? "OWNER",
  };
}
