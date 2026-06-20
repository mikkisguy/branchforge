/**
 * Visual Systems Service
 *
 * Business logic for visual system configuration (1:1 with projects).
 * The visual system config controls how generated Ren'Py visual
 * filenames are produced (template tokens, group prefixes, padding).
 *
 * Authorization is enforced via `requireProjectOwnership` from
 * `authz.service` — only the project owner may read or modify
 * this configuration.
 *
 * The DB column `scene_padding` predates the shared `labelPadding`
 * field on `VisualSystemConfig` and remains in the schema for
 * backward compatibility. This service maps between the two
 * transparently so the wire API always uses `labelPadding`.
 */

import { getDb } from "../db/index.js";
import { visualSystems } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { requireProjectOwnership } from "./authz.service.js";
import {
  VISUAL_SYSTEM_CONFIG_DEFAULTS,
  type VisualSystemConfigInput,
} from "../lib/validation.js";
import type { VisualSystem, NewVisualSystem } from "../db/schema/index.js";
import type { VisualSystemConfig } from "@branchforge/shared";
import { logWarn, LogEventType } from "../lib/logger.js";

// ============================================================================
// Types
// ============================================================================

/** Wire shape returned to clients — matches the shared `VisualSystemConfig`. */
export type VisualSystemConfigResult = VisualSystemConfig;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map a DB row to the wire `VisualSystemConfig` shape.
 *
 * The DB still has `scenePadding` (a deprecated column name from the
 * pre-shared-type era). The shared API uses `labelPadding`. They are
 * the same value; this function renames the field for the response.
 */
function toConfig(row: VisualSystem): VisualSystemConfigResult {
  // Drizzle's `jsonb` column type is typed as `unknown` at the row
  // level; the application always writes a `Record<string, Record<string, string>>`
  // there (validated by the Zod schema), so the cast is safe.
  const groupPrefixes = row.groupPrefixes as
    | Record<string, Record<string, string>>
    | null
    | undefined;
  return {
    namingTemplate: row.namingTemplate,
    // Strip `null` → `undefined` so the wire shape matches the
    // optional-fields interface in `@branchforge/shared`.
    ...(groupPrefixes !== null && groupPrefixes !== undefined
      ? { groupPrefixes }
      : {}),
    ...(row.defaultGroupType !== null && row.defaultGroupType !== undefined
      ? { defaultGroupType: row.defaultGroupType }
      : {}),
    labelPadding: row.scenePadding as 1 | 2,
    counterPadding: row.counterPadding as 1 | 2,
    jumpPrefixShared: row.jumpPrefixShared,
    ...(row.placeholderBaseUrl !== null && row.placeholderBaseUrl !== undefined
      ? { placeholderBaseUrl: row.placeholderBaseUrl }
      : {}),
  };
}

/**
 * Normalize an "optional string that can be cleared with empty string"
 * field. Returns `null` for both `undefined` (field omitted from PATCH)
 * and `""` (explicit clear).
 */
function optionalStringOrNull(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  return value;
}

/**
 * Normalize the `groupPrefixes` field. Returns `null` for both
 * `undefined` (omitted) and `{}` (explicit clear).
 */
function optionalGroupPrefixes(
  value: Record<string, Record<string, string>> | undefined
): Record<string, Record<string, string>> | null {
  if (value === undefined) return null;
  if (Object.keys(value).length === 0) return null;
  return value;
}

/**
 * Build a full insert payload by merging the provided config
 * with the project defaults. Any field left `undefined` in the
 * input falls back to the default (this is what makes the
 * "first get creates a default row" path safe).
 */
function buildInsertValues(
  projectId: string,
  input: Partial<VisualSystemConfigInput>
): NewVisualSystem {
  return {
    projectId,
    namingTemplate:
      input.namingTemplate ?? VISUAL_SYSTEM_CONFIG_DEFAULTS.namingTemplate,
    groupPrefixes: optionalGroupPrefixes(input.groupPrefixes),
    defaultGroupType: optionalStringOrNull(input.defaultGroupType),
    scenePadding:
      input.labelPadding ?? VISUAL_SYSTEM_CONFIG_DEFAULTS.labelPadding,
    counterPadding:
      input.counterPadding ?? VISUAL_SYSTEM_CONFIG_DEFAULTS.counterPadding,
    jumpPrefixShared:
      input.jumpPrefixShared ?? VISUAL_SYSTEM_CONFIG_DEFAULTS.jumpPrefixShared,
    placeholderBaseUrl: optionalStringOrNull(input.placeholderBaseUrl),
    updatedAt: new Date(),
  };
}

// ============================================================================
// VisualSystemsService
// ============================================================================

export class VisualSystemsService {
  /**
   * Get the visual system config for a project, creating a default
   * row on first read. Enforces project ownership.
   */
  async getVisualSystemConfig(
    projectId: string,
    userId: string
  ): Promise<VisualSystemConfigResult> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    // Insert defaults on conflict-do-nothing, then select. This makes
    // the first GET idempotent: a concurrent second caller will not
    // overwrite the row that the first caller is about to create.
    await db
      .insert(visualSystems)
      .values(buildInsertValues(projectId, {}))
      .onConflictDoNothing({ target: [visualSystems.projectId] });

    const [row] = await db
      .select()
      .from(visualSystems)
      .where(eq(visualSystems.projectId, projectId))
      .limit(1);

    if (!row) {
      // Defensive: should be impossible after the upsert above. If it
      // does happen, fall back to in-memory defaults so the caller
      // still gets a usable config — but surface the anomaly so we
      // can investigate a DB consistency issue if it ever fires.
      logWarn(LogEventType.SERVICE_ERROR, {
        message:
          "Visual system row missing after upsert; returning in-memory defaults",
        projectId,
      });
      return {
        namingTemplate: VISUAL_SYSTEM_CONFIG_DEFAULTS.namingTemplate,
        labelPadding: VISUAL_SYSTEM_CONFIG_DEFAULTS.labelPadding as 1 | 2,
        counterPadding: VISUAL_SYSTEM_CONFIG_DEFAULTS.counterPadding as 1 | 2,
        jumpPrefixShared: VISUAL_SYSTEM_CONFIG_DEFAULTS.jumpPrefixShared,
      };
    }

    return toConfig(row);
  }

  /**
   * Upsert (PATCH) the visual system config for a project.
   * Enforces project ownership.
   */
  async updateVisualSystemConfig(
    projectId: string,
    userId: string,
    input: VisualSystemConfigInput
  ): Promise<VisualSystemConfigResult> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    // Build the patch set. Only fields that the caller explicitly
    // provided are written — `.partial()` on the schema guarantees
    // `undefined` for omitted fields, and we treat that as "leave alone".
    // For clearable fields (`defaultGroupType`, `placeholderBaseUrl`,
    // `groupPrefixes`) an explicit empty value (`""` / `{}`) means
    // "clear back to NULL", matching the dialog's clearing semantics.
    const patch: Partial<NewVisualSystem> = { updatedAt: new Date() };
    if (input.namingTemplate !== undefined) {
      patch.namingTemplate = input.namingTemplate;
    }
    if (input.groupPrefixes !== undefined) {
      patch.groupPrefixes = optionalGroupPrefixes(input.groupPrefixes);
    }
    if (input.defaultGroupType !== undefined) {
      patch.defaultGroupType = optionalStringOrNull(input.defaultGroupType);
    }
    if (input.labelPadding !== undefined) {
      patch.scenePadding = input.labelPadding;
    }
    if (input.counterPadding !== undefined) {
      patch.counterPadding = input.counterPadding;
    }
    if (input.jumpPrefixShared !== undefined) {
      patch.jumpPrefixShared = input.jumpPrefixShared;
    }
    if (input.placeholderBaseUrl !== undefined) {
      patch.placeholderBaseUrl = optionalStringOrNull(input.placeholderBaseUrl);
    }

    const [updated] = await db
      .insert(visualSystems)
      .values(buildInsertValues(projectId, input))
      .onConflictDoUpdate({
        target: [visualSystems.projectId],
        set: patch,
      })
      .returning();

    if (!updated) {
      // Both insert and update must return a row; if not, something
      // is very wrong. Throw to surface the issue rather than
      // silently returning a partial config.
      throw new Error(
        `Failed to upsert visual system config for project ${projectId}`
      );
    }

    return toConfig(updated);
  }
}

export const visualSystemsService = new VisualSystemsService();
