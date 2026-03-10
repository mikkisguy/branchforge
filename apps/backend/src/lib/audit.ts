/**
 * Audit Trail Utilities
 *
 * Helper functions for managing audit fields (createdBy, updatedBy, version)
 * across database operations. Provides consistent audit tracking for all entities.
 */

/**
 * Audit fields interface for database entities
 */
export interface AuditFields {
  createdBy?: string;
  updatedBy?: string;
  version?: number;
}

/**
 * Create audit fields for new entity creation
 * Sets createdBy, updatedBy to the creating user, and version to 1
 *
 * @param userId - The ID of the user creating the entity
 * @returns Audit fields object for creation
 *
 * @example
 * ```ts
 * const auditFields = createAuditFields(userId);
 * await db.insert(labels).values({
 *   ...otherFields,
 *   ...auditFields,
 * });
 * ```
 */
export function createAuditFields(userId: string): AuditFields {
  return {
    createdBy: userId,
    updatedBy: userId,
    version: 1,
  };
}

/**
 * Update audit fields for entity modification
 * Sets updatedBy and increments version
 *
 * @param currentVersion - The current version number of the entity
 * @param userId - The ID of the user updating the entity
 * @returns Audit fields object for update
 *
 * @example
 * ```ts
 * const currentLabel = await getLabel(labelId);
 * const auditFields = updateAuditFields(currentLabel.version, userId);
 * await db.update(labels).set({
 *   ...otherFields,
 *   ...auditFields,
 * });
 * ```
 */
export function updateAuditFields(
  currentVersion: number,
  userId: string,
): AuditFields {
  return {
    updatedBy: userId,
    version: currentVersion + 1,
  };
}

/**
 * Create soft delete fields for entity deletion
 * Returns an object with deletedAt timestamp
 *
 * @returns Soft delete fields object
 *
 * @example
 * ```ts
 * const softDeleteFields = createSoftDeleteFields();
 * await db.update(labels).set(softDeleteFields);
 * ```
 */
export function createSoftDeleteFields(): {
  deletedAt: Date;
} {
  return {
    deletedAt: new Date(),
  };
}
