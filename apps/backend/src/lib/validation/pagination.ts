/**
 * Pagination Validation Schemas
 *
 * Shared pagination query parameters.
 */

import { z } from "zod";

/**
 * Pagination query validation
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
