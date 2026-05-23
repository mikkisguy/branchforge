/**
 * Stats Service
 *
 * Handles stat CRUD operations and progression queries.
 * Stats are numerical relationship stats (affection, trust, etc.)
 * that change based on player choices across visual novel scenes.
 */

import { getDb } from "../db/index.js";
import { stats, labels } from "../db/schema/index.js";
import { eq, and, isNull } from "drizzle-orm";
import type { Stat, NewStat } from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import { isUniqueConstraintViolation } from "../lib/db.js";
import type { StatLabelEffect, StatProgression } from "@branchforge/shared";
import type { CreateStatInput, UpdateStatInput } from "../lib/validation.js";

// ============================================================================
// Public Types
// ============================================================================

export interface PublicStat {
  id: string;
  projectId: string;
  characterId: string | null;
  key: string;
  name: string;
  minValue: number;
  maxValue: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

function mapToPublicStat(stat: Stat): PublicStat {
  return {
    id: stat.id,
    projectId: stat.projectId,
    characterId: stat.characterId,
    key: stat.key,
    name: stat.name,
    minValue: stat.minValue,
    maxValue: stat.maxValue,
    description: stat.description,
    createdAt: stat.createdAt.toISOString(),
    updatedAt: stat.updatedAt.toISOString(),
  };
}

// ============================================================================
// StatsService
// ============================================================================

export class StatsService {
  // --------------------------------------------------------------------------
  // Authorization helper
  // --------------------------------------------------------------------------

  async requireStatAccess(statId: string, userId: string): Promise<Stat> {
    const db = getDb();

    const [stat] = await db
      .select()
      .from(stats)
      .where(eq(stats.id, statId))
      .limit(1);

    if (!stat) {
      throw new NotFoundError("Stat");
    }

    await requireProjectOwnership(stat.projectId, userId);

    return stat;
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  /** List all stats for a project. */
  async listStats(projectId: string, userId: string): Promise<PublicStat[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const rows = await db
      .select()
      .from(stats)
      .where(eq(stats.projectId, projectId))
      .orderBy(stats.key);

    return rows.map(mapToPublicStat);
  }

  /** Create a new stat. */
  async createStat(
    projectId: string,
    userId: string,
    input: CreateStatInput
  ): Promise<PublicStat> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const minValue = input.minValue ?? 0;
    const maxValue = input.maxValue ?? 100;

    if (minValue > maxValue) {
      throw new ValidationError(
        "Minimum value must be less than or equal to maximum value"
      );
    }

    const newStat: NewStat = {
      projectId,
      characterId: input.characterId ?? null,
      key: input.key,
      name: input.name,
      minValue,
      maxValue,
      description: input.description ?? null,
    };

    try {
      const [result] = await db
        .insert(stats)
        .values(newStat)
        .onConflictDoNothing({
          target: [stats.projectId, stats.key],
        })
        .returning();

      if (!result) {
        throw new ConflictError("Stat with this key already exists");
      }

      return mapToPublicStat(result);
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictError("Stat with this key already exists");
      }
      throw err;
    }
  }

  /** Update an existing stat. */
  async updateStat(
    statId: string,
    userId: string,
    input: UpdateStatInput
  ): Promise<PublicStat> {
    const currentStat = await this.requireStatAccess(statId, userId);

    const effectiveMin = input.minValue ?? currentStat.minValue;
    const effectiveMax = input.maxValue ?? currentStat.maxValue;

    if (effectiveMin > effectiveMax) {
      throw new ValidationError(
        "Minimum value must be less than or equal to maximum value"
      );
    }

    const db = getDb();

    try {
      const [updated] = await db
        .update(stats)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(stats.id, statId))
        .returning();

      if (!updated) {
        throw new NotFoundError("Stat");
      }

      return mapToPublicStat(updated);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictError("Stat with this key already exists");
      }
      throw err;
    }
  }

  /** Delete a stat. */
  async deleteStat(statId: string, userId: string): Promise<void> {
    await this.requireStatAccess(statId, userId);

    const db = getDb();
    await db.delete(stats).where(eq(stats.id, statId));
  }

  // --------------------------------------------------------------------------
  // Progression
  // --------------------------------------------------------------------------

  /**
   * Get progression data for all stats in a project.
   * Scans all active labels and extracts stat references from
   * conditions and effects JSONB fields.
   */
  async getProgression(
    projectId: string,
    userId: string
  ): Promise<StatProgression[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    // Fetch all stats for the project
    const projectStats = await db
      .select()
      .from(stats)
      .where(eq(stats.projectId, projectId))
      .orderBy(stats.key);

    if (projectStats.length === 0) {
      return [];
    }

    // Fetch all active labels for this project
    const projectLabels = await db
      .select({
        id: labels.id,
        title: labels.title,
        route: labels.route,
        conditions: labels.conditions,
        effects: labels.effects,
      })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

    // Build progression data for each stat
    return projectStats.map((stat) => {
      const labelEffects: StatLabelEffect[] = [];

      for (const label of projectLabels) {
        const conditions = (label.conditions ?? {}) as {
          stats?: Record<string, number>;
        };
        const fx = (label.effects ?? {}) as {
          stats?: Record<string, number>;
        };

        const conditionValue = conditions.stats?.[stat.key] ?? null;
        const effectDelta = fx.stats?.[stat.key] ?? null;

        // Only include labels that actually reference this stat
        if (conditionValue !== null || effectDelta !== null) {
          labelEffects.push({
            labelId: label.id,
            labelTitle: label.title,
            routeKey: label.route ?? null,
            conditionValue,
            effectDelta,
          });
        }
      }

      return {
        statKey: stat.key,
        statName: stat.name,
        minValue: stat.minValue,
        maxValue: stat.maxValue,
        labels: labelEffects,
      };
    });
  }
}

export const statsService = new StatsService();
