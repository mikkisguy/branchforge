/**
 * Shared Database Types
 *
 * Schema-aware types derived from the real database instance.
 * Replaces generic Record<string, unknown> with actual schema types.
 */

import type {
  NodePgDatabase,
  NodePgTransaction,
} from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { Db } from "./index.js";

/**
 * Schema-aware Transaction type derived from the actual database instance.
 * This preserves full type safety for database queries within transactions.
 *
 * Derived from the Db type's transaction callback parameter.
 */
export type Transaction =
  Db extends NodePgDatabase<infer TSchema>
    ? NodePgTransaction<TSchema, ExtractTablesWithRelations<TSchema>>
    : never;
