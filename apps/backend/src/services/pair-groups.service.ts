/**
 * Pair Groups Service
 *
 * Handles pair group CRUD operations for sequel duo ending tracking.
 * Authorization is enforced via requireProjectOwnership from authz.service.
 *
 * Note: The `duoEndingEnabled` flag on the project is a UI-level toggle only.
 * The backend does not gate pair group operations on this flag, matching the
 * pattern used by other project feature toggles in this codebase.
 */

import { getDb } from "../db/index.js";
import { pairGroups, characters } from "../db/schema/index.js";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  NotFoundError,
  ConflictError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import type { PairGroup } from "../db/schema/index.js";
import type { PairGroupWithNames } from "@branchforge/shared";

// ============================================================================
// Helpers
// ============================================================================

/** Given character IDs and a projectId, fetch displayNames as a map. */
async function getCharNameMap(
  projectId: string,
  charIds: string[]
): Promise<Map<string, string>> {
  if (charIds.length === 0) return new Map();

  const rows = await getDb()
    .select({
      id: characters.id,
      displayName: characters.displayName,
    })
    .from(characters)
    .where(
      and(eq(characters.projectId, projectId), inArray(characters.id, charIds))
    );

  const m = new Map<string, string>();
  for (const r of rows) m.set(r.id, r.displayName);
  return m;
}

/** Collect all character IDs from a list of pair group rows. */
function collectCharIds(
  pgs: { characterAId: string; characterBId: string }[]
): string[] {
  const s = new Set<string>();
  for (const pg of pgs) {
    s.add(pg.characterAId);
    s.add(pg.characterBId);
  }
  return Array.from(s);
}

/** Map a drizzle PairGroup row to PairGroupWithNames. */
function toPairGroupWithNames(
  pg: PairGroup,
  nameMap: Map<string, string>
): PairGroupWithNames {
  return {
    id: pg.id,
    projectId: pg.projectId,
    characterAId: pg.characterAId,
    characterBId: pg.characterBId,
    duoEndingLabel: pg.duoEndingLabel,
    createdAt: pg.createdAt.toISOString(),
    updatedAt: pg.updatedAt.toISOString(),
    characterAName: nameMap.get(pg.characterAId) ?? "Unknown",
    characterBName: nameMap.get(pg.characterBId) ?? "Unknown",
  };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List all pair groups for a project with character names.
 */
export async function listPairGroups(
  projectId: string,
  userId: string
): Promise<PairGroupWithNames[]> {
  await requireProjectOwnership(projectId, userId);

  const pgs = await getDb()
    .select()
    .from(pairGroups)
    .where(eq(pairGroups.projectId, projectId))
    .orderBy(asc(pairGroups.createdAt));

  if (pgs.length === 0) return [];

  const nameMap = await getCharNameMap(projectId, collectCharIds(pgs));

  return pgs.map((pg) => toPairGroupWithNames(pg, nameMap));
}

/**
 * Get a single pair group by ID.
 */
export async function getPairGroup(
  pairGroupId: string,
  userId: string
): Promise<PairGroupWithNames | null> {
  const [pg] = await getDb()
    .select()
    .from(pairGroups)
    .where(eq(pairGroups.id, pairGroupId))
    .limit(1);

  if (!pg) return null;

  await requireProjectOwnership(pg.projectId, userId);

  const nameMap = await getCharNameMap(pg.projectId, [
    pg.characterAId,
    pg.characterBId,
  ]);

  return toPairGroupWithNames(pg, nameMap);
}

/**
 * Create a new pair group.
 * Canonically orders characterAId < characterBId to satisfy the DB check constraint.
 */
export async function createPairGroup(
  projectId: string,
  userId: string,
  data: {
    characterAId: string;
    characterBId: string;
    duoEndingLabel: string;
  }
): Promise<PairGroup> {
  await requireProjectOwnership(projectId, userId);

  // Canonical order: character_a_id < character_b_id (DB check constraint)
  const aId =
    data.characterAId < data.characterBId
      ? data.characterAId
      : data.characterBId;
  const bId =
    data.characterAId < data.characterBId
      ? data.characterBId
      : data.characterAId;

  // Verify both characters belong to this project
  const charIds = [aId, bId];
  const charRows = await getDb()
    .select({ id: characters.id })
    .from(characters)
    .where(
      and(eq(characters.projectId, projectId), inArray(characters.id, charIds))
    );

  const existingIds = new Set(charRows.map((c) => c.id));
  if (!existingIds.has(aId)) {
    throw new NotFoundError("character_a_id not found in this project");
  }
  if (!existingIds.has(bId)) {
    throw new NotFoundError("character_b_id not found in this project");
  }

  try {
    const [created] = await getDb()
      .insert(pairGroups)
      .values({
        projectId,
        characterAId: aId,
        characterBId: bId,
        duoEndingLabel: data.duoEndingLabel,
      })
      .returning();

    return created;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      throw new ConflictError(
        "A pair group with these characters already exists"
      );
    }
    throw error;
  }
}

/**
 * Update a pair group. Only duoEndingLabel can be changed.
 */
export async function updatePairGroup(
  pairGroupId: string,
  userId: string,
  data: {
    duoEndingLabel?: string;
  }
): Promise<PairGroup> {
  const [existing] = await getDb()
    .select()
    .from(pairGroups)
    .where(eq(pairGroups.id, pairGroupId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Pair group not found");
  }

  await requireProjectOwnership(existing.projectId, userId);

  const [updated] = await getDb()
    .update(pairGroups)
    .set({
      ...(data.duoEndingLabel !== undefined
        ? { duoEndingLabel: data.duoEndingLabel }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(pairGroups.id, pairGroupId))
    .returning();

  return updated;
}

/**
 * Delete a pair group. The foreign key from labels.duoPairId has ON DELETE SET NULL,
 * so deleting a pair group automatically clears duoPairId on any referencing labels.
 */
export async function deletePairGroup(
  pairGroupId: string,
  userId: string
): Promise<void> {
  const [existing] = await getDb()
    .select()
    .from(pairGroups)
    .where(eq(pairGroups.id, pairGroupId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Pair group not found");
  }

  await requireProjectOwnership(existing.projectId, userId);

  await getDb().delete(pairGroups).where(eq(pairGroups.id, pairGroupId));
}
