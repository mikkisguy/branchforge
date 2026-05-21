/**
 * Meters Service
 *
 * Handles meter CRUD operations and progression queries.
 * Meters are numerical relationship stats (affection, trust, etc.)
 * that change based on player choices across visual novel scenes.
 */

import { getDb } from "../db/index.js";
import { meters, labels } from "../db/schema/index.js";
import { eq, and, isNull } from "drizzle-orm";
import type { Meter, NewMeter } from "../db/schema/index.js";
import {
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.middleware.js";
import { requireProjectOwnership } from "./authz.service.js";
import type { MeterLabelEffect, MeterProgression } from "@branchforge/shared";

// ============================================================================
// Public Types
// ============================================================================

export interface PublicMeter {
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

export interface CreateMeterBody {
  key: string;
  name: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

export interface UpdateMeterBody {
  name?: string;
  characterId?: string | null;
  minValue?: number;
  maxValue?: number;
  description?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function mapToPublicMeter(meter: Meter): PublicMeter {
  return {
    id: meter.id,
    projectId: meter.projectId,
    characterId: meter.characterId,
    key: meter.key,
    name: meter.name,
    minValue: meter.minValue,
    maxValue: meter.maxValue,
    description: meter.description,
    createdAt: meter.createdAt.toISOString(),
    updatedAt: meter.updatedAt.toISOString(),
  };
}

// ============================================================================
// MetersService
// ============================================================================

export class MetersService {
  // --------------------------------------------------------------------------
  // Authorization helper
  // --------------------------------------------------------------------------

  async requireMeterAccess(meterId: string, userId: string): Promise<Meter> {
    const db = getDb();

    const [meter] = await db
      .select()
      .from(meters)
      .where(eq(meters.id, meterId))
      .limit(1);

    if (!meter) {
      throw new NotFoundError("Meter");
    }

    await requireProjectOwnership(meter.projectId, userId);

    return meter;
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  /** List all meters for a project. */
  async listMeters(projectId: string, userId: string): Promise<PublicMeter[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const rows = await db
      .select()
      .from(meters)
      .where(eq(meters.projectId, projectId))
      .orderBy(meters.key);

    return rows.map(mapToPublicMeter);
  }

  /** Create a new meter. */
  async createMeter(
    projectId: string,
    userId: string,
    input: CreateMeterBody
  ): Promise<PublicMeter> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const newMeter: NewMeter = {
      projectId,
      characterId: input.characterId ?? null,
      key: input.key,
      name: input.name,
      minValue: input.minValue ?? 0,
      maxValue: input.maxValue ?? 100,
      description: input.description ?? null,
    };

    try {
      const [result] = await db
        .insert(meters)
        .values(newMeter)
        .onConflictDoNothing({
          target: [meters.projectId, meters.key],
        })
        .returning();

      if (!result) {
        throw new ConflictError("Meter with this key already exists");
      }

      return mapToPublicMeter(result);
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      if (err instanceof Error && "code" in err && err.code === "23505") {
        throw new ConflictError("Meter with this key already exists");
      }
      throw err;
    }
  }

  /** Update an existing meter. */
  async updateMeter(
    meterId: string,
    userId: string,
    input: UpdateMeterBody
  ): Promise<PublicMeter> {
    await this.requireMeterAccess(meterId, userId);

    const db = getDb();

    try {
      const [updated] = await db
        .update(meters)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(meters.id, meterId))
        .returning();

      if (!updated) {
        throw new NotFoundError("Meter");
      }

      return mapToPublicMeter(updated);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      if (err instanceof Error && "code" in err && err.code === "23505") {
        throw new ConflictError("Meter with this key already exists");
      }
      throw err;
    }
  }

  /** Delete a meter. */
  async deleteMeter(meterId: string, userId: string): Promise<void> {
    await this.requireMeterAccess(meterId, userId);

    const db = getDb();
    await db.delete(meters).where(eq(meters.id, meterId));
  }

  // --------------------------------------------------------------------------
  // Progression
  // --------------------------------------------------------------------------

  /**
   * Get progression data for all meters in a project.
   * Scans all active labels and extracts meter references from
   * prerequisites and effects JSONB fields.
   */
  async getProgression(
    projectId: string,
    userId: string
  ): Promise<MeterProgression[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    // Fetch all meters for the project
    const projectMeters = await db
      .select()
      .from(meters)
      .where(eq(meters.projectId, projectId))
      .orderBy(meters.key);

    if (projectMeters.length === 0) {
      return [];
    }

    // Fetch all active labels for this project
    const projectLabels = await db
      .select({
        id: labels.id,
        title: labels.title,
        route: labels.route,
        prerequisites: labels.prerequisites,
        effects: labels.effects,
      })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), isNull(labels.deletedAt)));

    // Build progression data for each meter
    return projectMeters.map((meter) => {
      const labelEffects: MeterLabelEffect[] = [];

      for (const label of projectLabels) {
        const prereqs = (label.prerequisites ?? {}) as {
          meters?: Record<string, number>;
        };
        const fx = (label.effects ?? {}) as {
          meters?: Record<string, number>;
        };

        const prerequisiteValue = prereqs.meters?.[meter.key] ?? null;
        const effectDelta = fx.meters?.[meter.key] ?? null;

        // Only include labels that actually reference this meter
        if (prerequisiteValue !== null || effectDelta !== null) {
          labelEffects.push({
            labelId: label.id,
            labelTitle: label.title,
            routeKey: label.route ?? null,
            prerequisiteValue,
            effectDelta,
          });
        }
      }

      return {
        meterKey: meter.key,
        meterName: meter.name,
        minValue: meter.minValue,
        maxValue: meter.maxValue,
        labels: labelEffects,
      };
    });
  }
}

export const metersService = new MetersService();
