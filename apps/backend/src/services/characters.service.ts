/**
 * Characters Service
 *
 * Handles all character management business logic including detection,
 * import, CRUD operations, avatar management, and project settings.
 * Authorization is enforced via requireProjectOwnership from authz.service.
 */

import { getDb } from "../db/index.js";
import {
  characters,
  projectSettings,
  labels,
  projectFiles,
} from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  NotFoundError,
  ConflictError,
} from "../middleware/error-handler.middleware.js";
import {
  characterParserService,
  type DetectedCharacter,
  type CharacterConflict,
} from "./character-parser.service.js";
import { characterLinkerService } from "./character-linker.service.js";
import { requireProjectOwnership } from "./authz.service.js";
import { deleteAvatar as deleteAvatarFile } from "./image-processing.service.js";
import { getAvatarFullPath } from "../lib/storage.js";
import { logWarn, LogEventType } from "../lib/logger.js";
import {
  uploadAvatar as uploadAvatarFile,
  deleteAvatar as deleteAvatarFileFn,
  buildAvatarUrl,
} from "./characters/avatar.js";
import type { Character, ProjectSettings } from "../db/schema/index.js";
import type {
  CreateCharacterInput,
  UpdateCharacterInput,
  ImportCharactersInput,
  ProjectSettingsInput,
} from "../lib/validation.js";

// ============================================================================
// Types
// ============================================================================

/** Character detail returned for list-views and single-character operations */
export interface CharacterDetail {
  id: string;
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation: string | null;
  isLoveInterest: boolean;
  isNarrator: boolean;
  notes: string | null;
  conditionalPrefix: string | null;
  avatarUrl: string | null;
}

/** Result of character detection */
export interface DetectCharactersResult {
  characters: DetectedCharacter[];
  excludedTags: string[];
  narratorCharacterTags: string[];
  existingTags: string[];
  conflicts: CharacterConflict[];
}

/** Result of character import */
export interface ImportCharactersResult {
  characters: Array<{
    id: string;
    tag: string;
    name: string;
    displayName: string;
  }>;
  linked: number;
  unmatched: string[];
}

/** Project character settings subset */
export interface CharacterSettingsResult {
  excludedCharacterTags: string[];
  narratorCharacterTags: string[];
  autoLinkSpeakers: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/** Fields needed to produce a CharacterDetail */
type CharacterFields = Pick<
  Character,
  | "id"
  | "name"
  | "displayName"
  | "renpyTag"
  | "color"
  | "routeAffiliation"
  | "isLoveInterest"
  | "isNarrator"
  | "notes"
  | "conditionalPrefix"
  | "avatarUrl"
>;

/** Map a character row (or partial) to the public CharacterDetail shape. */
function toCharacterDetail(character: CharacterFields): CharacterDetail {
  return {
    id: character.id,
    name: character.name,
    displayName: character.displayName,
    renpyTag: character.renpyTag,
    color: character.color,
    routeAffiliation: character.routeAffiliation,
    isLoveInterest: character.isLoveInterest,
    isNarrator: character.isNarrator,
    notes: character.notes,
    conditionalPrefix: character.conditionalPrefix,
    avatarUrl: buildAvatarUrl(character.avatarUrl),
  };
}

// ============================================================================
// CharactersService
// ============================================================================

export class CharactersService {
  // --------------------------------------------------------------------------
  // Project settings
  // --------------------------------------------------------------------------

  /**
   * Get or create project settings, enforcing ownership.
   */
  async getProjectSettings(
    projectId: string,
    userId: string
  ): Promise<ProjectSettings> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    // Try insert first, then select to handle race condition
    await db
      .insert(projectSettings)
      .values({
        projectId,
        excludedCharacterTags: ["n", "u", "narrator", "extend"],
        narratorCharacterTags: [],
        autoLinkSpeakers: true,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const [settings] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))
      .limit(1);

    return settings;
  }

  /**
   * Upsert project character settings.
   */
  async updateCharacterSettings(
    projectId: string,
    userId: string,
    input: ProjectSettingsInput
  ): Promise<CharacterSettingsResult> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const [updatedSettings] = await db
      .insert(projectSettings)
      .values({
        projectId,
        excludedCharacterTags: input.excludedCharacterTags ?? [
          "n",
          "u",
          "narrator",
          "extend",
        ],
        narratorCharacterTags: input.narratorCharacterTags ?? [],
        autoLinkSpeakers: input.autoLinkSpeakers ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [projectSettings.projectId],
        set: {
          ...(input.excludedCharacterTags && {
            excludedCharacterTags: input.excludedCharacterTags,
          }),
          ...(input.narratorCharacterTags && {
            narratorCharacterTags: input.narratorCharacterTags,
          }),
          ...(input.autoLinkSpeakers !== undefined && {
            autoLinkSpeakers: input.autoLinkSpeakers,
          }),
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      excludedCharacterTags: updatedSettings.excludedCharacterTags ?? [],
      narratorCharacterTags: updatedSettings.narratorCharacterTags ?? [],
      autoLinkSpeakers: updatedSettings.autoLinkSpeakers,
    };
  }

  /** Get project character settings subset. Ownership enforced by getProjectSettings. */
  async getCharacterSettings(
    projectId: string,
    userId: string
  ): Promise<CharacterSettingsResult> {
    // getProjectSettings enforces ownership
    const settings = await this.getProjectSettings(projectId, userId);
    return {
      excludedCharacterTags: settings.excludedCharacterTags ?? [],
      narratorCharacterTags: settings.narratorCharacterTags ?? [],
      autoLinkSpeakers: settings.autoLinkSpeakers,
    };
  }

  // --------------------------------------------------------------------------
  // Authorization helper
  // --------------------------------------------------------------------------

  /**
   * Fetch a character by ID and verify the caller's project ownership.
   * Throws NotFoundError if the character (or its project) doesn't exist,
   * and ForbiddenError if the caller lacks access.
   */
  async requireCharacterAccess(
    characterId: string,
    userId: string
  ): Promise<Character> {
    const db = getDb();

    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1);

    if (!character) {
      throw new NotFoundError("Character");
    }

    await requireProjectOwnership(character.projectId, userId);

    return character;
  }

  // --------------------------------------------------------------------------
  // Detection
  // --------------------------------------------------------------------------

  /**
   * Detect characters from all project RPY files, deduplicate by tag, and
   * detect conflicts with already-imported characters.
   */
  async detectCharacters(
    projectId: string,
    userId: string
  ): Promise<DetectCharactersResult> {
    // getProjectSettings enforces ownership
    const db = getDb();

    const settings = await this.getProjectSettings(projectId, userId);
    const excludedTags = new Set(settings.excludedCharacterTags ?? []);

    const [existingCharacters, allProjectFiles] = await Promise.all([
      db.select().from(characters).where(eq(characters.projectId, projectId)),
      db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId)),
    ]);

    const allDetected: DetectedCharacter[] = [];
    for (const file of allProjectFiles) {
      // The import path (issue #244) strips `define` / `default`
      // statements from `content` and stores them in the database
      // (the single source of truth). For the import wizard we
      // still need to surface what *was* in the source file, so we
      // read from `originalContent` when available and fall back
      // to `content` for files created entirely from scratch (e.g.
      // a brand-new BranchForge project).
      const sourceContent = file.originalContent ?? file.content;
      if (sourceContent) {
        const fileCharacters = characterParserService.parseWithExclusions(
          sourceContent,
          file.filePath,
          excludedTags
        );
        allDetected.push(...fileCharacters);
      }
    }

    // Deduplicate by tag
    const seenTags = new Set<string>();
    const uniqueCharacters: DetectedCharacter[] = [];
    for (const char of allDetected) {
      if (!seenTags.has(char.tag)) {
        seenTags.add(char.tag);
        uniqueCharacters.push(char);
      }
    }

    const conflicts = characterParserService.detectConflicts(
      uniqueCharacters,
      existingCharacters.map((c) => ({
        renpyTag: c.renpyTag,
        name: c.name,
        displayName: c.displayName,
        color: c.color,
      }))
    );

    const existingTags = existingCharacters.map((c) => c.renpyTag);

    return {
      characters: uniqueCharacters,
      excludedTags: Array.from(excludedTags),
      narratorCharacterTags: settings.narratorCharacterTags ?? [],
      existingTags,
      conflicts,
    };
  }

  // --------------------------------------------------------------------------
  // Import
  // --------------------------------------------------------------------------

  /**
   * Import characters (create or update) and optionally link speakers to
   * lines.
   */
  async importCharacters(
    projectId: string,
    userId: string,
    input: ImportCharactersInput
  ): Promise<ImportCharactersResult> {
    await requireProjectOwnership(projectId, userId);

    const {
      characters: charactersToImport,
      excludedTags,
      narratorTags,
      linkToLines,
    } = input;

    // Wrap the entire import flow (settings update + character upserts +
    // speaker linking) in a transaction so a failure at any stage rolls
    // back to the pre-import state.
    return getDb().transaction(async (tx) => {
      // Update project settings
      await tx
        .insert(projectSettings)
        .values({
          projectId,
          excludedCharacterTags: excludedTags,
          narratorCharacterTags: narratorTags,
          autoLinkSpeakers: linkToLines,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [projectSettings.projectId],
          set: {
            excludedCharacterTags: excludedTags,
            narratorCharacterTags: narratorTags,
            autoLinkSpeakers: linkToLines,
            updatedAt: new Date(),
          },
        });

      const existingCharacters = await tx
        .select()
        .from(characters)
        .where(eq(characters.projectId, projectId));

      const existingByTag = new Map(
        existingCharacters.map((c) => [c.renpyTag, c])
      );

      const createdCharacters = await Promise.all(
        charactersToImport.map(async (charData) => {
          const existing = existingByTag.get(charData.tag);

          if (existing) {
            // Update existing character — only set boolean flags when
            // explicitly provided to avoid clobbering existing DB values
            // during re-import of conflict characters.
            const updates: Record<string, unknown> = {
              name: charData.name ?? charData.tag,
              displayName: charData.displayName,
              color: charData.color,
              routeAffiliation: charData.routeAffiliation,
              updatedAt: new Date(),
            };
            if (charData.isLoveInterest !== undefined) {
              updates.isLoveInterest = charData.isLoveInterest;
            }
            if (charData.isNarrator !== undefined) {
              updates.isNarrator = charData.isNarrator;
            }
            await tx
              .update(characters)
              .set(updates)
              .where(eq(characters.id, existing.id));

            return {
              id: existing.id,
              tag: existing.renpyTag,
              name: charData.name ?? charData.tag,
              displayName: charData.displayName,
            };
          }

          // Create new character
          const [newChar] = await tx
            .insert(characters)
            .values({
              projectId,
              name: charData.name ?? charData.tag,
              displayName: charData.displayName,
              renpyTag: charData.tag,
              color: charData.color,
              routeAffiliation: charData.routeAffiliation,
              isLoveInterest: charData.isLoveInterest ?? false,
              isNarrator: charData.isNarrator ?? false,
            })
            .returning();

          return {
            id: newChar.id,
            tag: newChar.renpyTag,
            name: newChar.name,
            displayName: newChar.displayName,
          };
        })
      );

      let linked = 0;
      let unmatched: string[] = [];

      if (linkToLines) {
        const projectLabels = await tx
          .select({ id: labels.id })
          .from(labels)
          .where(eq(labels.projectId, projectId));

        const labelIds = projectLabels.map((l) => l.id);

        if (labelIds.length > 0) {
          const result = await characterLinkerService.linkSpeakersToLines(
            projectId,
            labelIds,
            new Set(excludedTags),
            tx
          );
          linked = result.linked;
          unmatched = result.unmatched;
        }
      }

      return { characters: createdCharacters, linked, unmatched };
    });
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  /** List all characters for a project, ordered by renpyTag. */
  async listCharacters(
    projectId: string,
    userId: string
  ): Promise<CharacterDetail[]> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const rows = await db
      .select({
        id: characters.id,
        name: characters.name,
        displayName: characters.displayName,
        renpyTag: characters.renpyTag,
        color: characters.color,
        routeAffiliation: characters.routeAffiliation,
        isLoveInterest: characters.isLoveInterest,
        isNarrator: characters.isNarrator,
        notes: characters.notes,
        conditionalPrefix: characters.conditionalPrefix,
        avatarUrl: characters.avatarUrl,
      })
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .orderBy(characters.renpyTag);

    return rows.map(toCharacterDetail);
  }

  /** Get a single character by ID with full detail. */
  async getCharacter(
    characterId: string,
    userId: string
  ): Promise<CharacterDetail> {
    const character = await this.requireCharacterAccess(characterId, userId);

    return toCharacterDetail(character);
  }

  /** Create a new character. */
  async createCharacter(
    projectId: string,
    userId: string,
    input: CreateCharacterInput
  ): Promise<CharacterDetail> {
    await requireProjectOwnership(projectId, userId);

    const db = getDb();

    const [newCharacter] = await db
      .insert(characters)
      .values({
        projectId,
        name: input.name,
        displayName: input.displayName,
        renpyTag: input.renpyTag,
        color: input.color,
        routeAffiliation: input.routeAffiliation,
        isLoveInterest: input.isLoveInterest,
        isNarrator: input.isNarrator,
        notes: input.notes,
        conditionalPrefix: input.conditionalPrefix,
      })
      .onConflictDoNothing({
        target: [characters.projectId, characters.renpyTag],
      })
      .returning();

    if (!newCharacter) {
      throw new ConflictError("Character with this tag already exists");
    }

    return toCharacterDetail(newCharacter);
  }

  /** Update a character. */
  async updateCharacter(
    characterId: string,
    userId: string,
    input: UpdateCharacterInput
  ): Promise<CharacterDetail> {
    await this.requireCharacterAccess(characterId, userId);

    const db = getDb();

    const [updated] = await db
      .update(characters)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(characters.id, characterId))
      .returning();

    return toCharacterDetail(updated);
  }

  /** Delete a character and its avatar file. */
  async deleteCharacter(characterId: string, userId: string): Promise<void> {
    const character = await this.requireCharacterAccess(characterId, userId);

    const db = getDb();

    await db.delete(characters).where(eq(characters.id, characterId));

    if (character.avatarUrl) {
      try {
        await deleteAvatarFile(getAvatarFullPath(character.avatarUrl));
      } catch {
        logWarn(LogEventType.SERVICE_ERROR, {
          message: `Failed to delete avatar file: ${character.avatarUrl}`,
          characterId,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Avatar management
  // --------------------------------------------------------------------------

  /**
   * Upload an avatar for a character.
   * Authorization enforced by requireCharacterAccess.
   */
  async uploadAvatar(
    characterId: string,
    userId: string,
    buffer: Buffer,
    mimetype: string
  ): Promise<{ avatarUrl: string }> {
    const character = await this.requireCharacterAccess(characterId, userId);
    return uploadAvatarFile(getDb(), character, buffer, mimetype);
  }

  /** Delete a character's avatar (file + DB). */
  async deleteAvatar(characterId: string, userId: string): Promise<void> {
    const character = await this.requireCharacterAccess(characterId, userId);
    return deleteAvatarFileFn(getDb(), character);
  }
}

export const charactersService = new CharactersService();
