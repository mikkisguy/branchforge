/**
 * Character Linker Service
 *
 * Links character tags in dialogue to labelLines.speakerId.
 * Handles exact matches, case-insensitive fallback, and special characters.
 *
 * Parses RPY files directly to extract speaker information, ensuring that
 * label_lines.content contains only the dialogue/narration text without speaker prefix.
 */

import { getDb } from "../db/index.js";
import type { Db } from "../db/index.js";
import type { Transaction } from "../db/types.js";
import {
  labelLines,
  characters,
  labels,
  projectFiles,
} from "../db/schema/index.js";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import {
  parseRPYFileWithLabels,
  convertToBranchForgeFormatFromLabels,
} from "./rpy-parser.service.js";

/** Union type for database connection (regular or transactional) */
type DatabaseConnection = Db | Transaction;

/**
 * Conflict information for speaker linking
 */
export interface SpeakerLinkConflict {
  speakerTag: string;
  matchedCharacterId: string | null;
  lineCount: number;
}

/**
 * Speaker linking result
 */
export interface SpeakerLinkResult {
  linked: number;
  unmatched: string[];
  conflicts: SpeakerLinkConflict[];
}

/**
 * Default excluded character tags (special Ren'Py characters)
 */
const DEFAULT_EXCLUDED_TAGS = new Set(["n", "u", "narrator", "extend"]);

/**
 * Character Linker Service
 */
class CharacterLinkerService {
  /**
   * Check if a speaker tag should be linked to a character
   */
  private shouldLinkTag(
    speakerTag: string | null,
    excludedTags: Set<string>
  ): boolean {
    if (!speakerTag) return false;
    if (DEFAULT_EXCLUDED_TAGS.has(speakerTag)) return false;
    if (excludedTags.has(speakerTag)) return false;
    return true;
  }

  /**
   * Build character lookup maps from project characters
   */
  private async buildCharacterMaps(
    projectId: string,
    db: DatabaseConnection
  ): Promise<{
    characterByTag: Map<string, string>;
    characterByTagLower: Map<string, string>;
  }> {
    const projectCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));

    const characterByTag = new Map<string, string>();
    const characterByTagLower = new Map<string, string>();

    for (const char of projectCharacters) {
      characterByTag.set(char.renpyTag, char.id);
      characterByTagLower.set(char.renpyTag.toLowerCase(), char.id);
    }

    return { characterByTag, characterByTagLower };
  }

  /**
   * Load labels with their project files and group dialogue lines by label
   */
  private async loadLabelsAndLines(labelIds: string[], db: DatabaseConnection) {
    const labelsWithFiles = await db
      .select({
        labelId: labels.id,
        labelName: labels.labelName,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(inArray(labels.id, labelIds));

    // Get all dialogue lines for these labels
    const allLines = await db
      .select({
        id: labelLines.id,
        labelId: labelLines.labelId,
        rpyLineNumber: labelLines.rpyLineNumber,
        contentType: labelLines.contentType,
        speakerId: labelLines.speakerId,
      })
      .from(labelLines)
      .where(
        and(inArray(labelLines.labelId, labelIds), isNull(labelLines.deletedAt))
      );

    // Group lines by labelId for efficient processing
    const linesByLabel = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const existing = linesByLabel.get(line.labelId);
      if (existing) {
        existing.push(line);
      } else {
        linesByLabel.set(line.labelId, [line]);
      }
    }

    return { labelsWithFiles, linesByLabel };
  }

  /**
   * Fetch unique project files in a single query and parse each once
   */
  private async loadAndParseProjectFiles(
    labelsWithFiles: Array<{
      labelId: string;
      labelName: string | null;
      projectFileId: string | null;
    }>,
    db: DatabaseConnection
  ) {
    // Collect unique project file IDs to avoid N+1 queries
    const uniqueProjectFileIds = Array.from(
      new Set(
        labelsWithFiles
          .map((l) => l.projectFileId)
          .filter((id): id is string => !!id)
      )
    );

    // Fetch all unique project files in a single query
    const projectFileMap = new Map<
      string,
      { content: string; filePath: string }
    >();
    if (uniqueProjectFileIds.length > 0) {
      const files = await db
        .select({
          id: projectFiles.id,
          content: projectFiles.content,
          filePath: projectFiles.filePath,
        })
        .from(projectFiles)
        .where(inArray(projectFiles.id, uniqueProjectFileIds));

      for (const file of files) {
        projectFileMap.set(file.id, {
          content: file.content,
          filePath: file.filePath,
        });
      }
    }

    // Parse each unique file once and cache the parsed result
    const parsedFileCache = new Map<
      string,
      ReturnType<typeof parseRPYFileWithLabels>
    >();
    for (const [fileId, fileData] of projectFileMap) {
      const parsed = parseRPYFileWithLabels(
        fileData.content,
        fileData.filePath
      );
      parsedFileCache.set(fileId, parsed);
    }

    return { projectFileMap, parsedFileCache };
  }

  /**
   * Process each label: match speakers to characters using parsed file data
   */
  private async processLabelSpeakers(
    labelsWithFiles: Array<{
      labelId: string;
      labelName: string | null;
      projectFileId: string | null;
    }>,
    projectFileMap: Map<string, { content: string; filePath: string }>,
    parsedFileCache: Map<string, ReturnType<typeof parseRPYFileWithLabels>>,
    linesByLabel: Map<
      string,
      Array<{
        id: string;
        labelId: string;
        rpyLineNumber: number | null;
        contentType: string;
        speakerId: string | null;
      }>
    >,
    characterByTag: Map<string, string>,
    characterByTagLower: Map<string, string>,
    excludedTags: Set<string>
  ) {
    // Track unmatched speaker tags and their occurrence counts
    const unmatchedTagCounts = new Map<string, number>();
    let linkedCount = 0;
    const updates: Array<{ lineId: string; speakerId: string | null }> = [];

    // Cache conversion results per (fileId, labelName) to avoid redundant
    // calls to convertToBranchForgeFormatFromLabels on the same parsed data.
    const conversionCache = new Map<
      string,
      ReturnType<typeof convertToBranchForgeFormatFromLabels>
    >();

    // Process each label
    for (const labelInfo of labelsWithFiles) {
      if (!labelInfo.projectFileId || !labelInfo.labelName) continue;

      // Get the project file content and parsed data from cache
      const projectFileData = projectFileMap.get(labelInfo.projectFileId);
      const parsed = parsedFileCache.get(labelInfo.projectFileId);

      if (!projectFileData?.content || !parsed) continue;

      // Find the label in the parsed file
      const parsedLabel = parsed.labels.find(
        (l) => l.label === labelInfo.labelName
      );
      if (!parsedLabel) continue;

      // Convert to BranchForge format to get entries (with caching)
      const cacheKey = `${labelInfo.projectFileId}:${labelInfo.labelName}`;
      let labelData = conversionCache.get(cacheKey);
      if (!labelData) {
        labelData = convertToBranchForgeFormatFromLabels(
          parsed,
          labelInfo.labelName,
          projectFileData.content
        );
        conversionCache.set(cacheKey, labelData);
      }

      // Build a map of RPY line number -> speaker for this label
      const speakerByLineNumber = new Map<number, string | null>();
      for (const entry of labelData.entries) {
        if (
          entry.type === "DIALOGUE" &&
          entry.speaker &&
          entry.lineNumber !== undefined
        ) {
          speakerByLineNumber.set(entry.lineNumber, entry.speaker);
        }
      }

      // Get lines for this label
      const linesForLabel = linesByLabel.get(labelInfo.labelId) || [];
      for (const line of linesForLabel) {
        // Skip non-dialogue lines
        if (line.contentType !== "DIALOGUE") continue;

        // Clear stale speakerId for lines without RPY line number
        if (!line.rpyLineNumber) {
          if (line.speakerId) {
            updates.push({ lineId: line.id, speakerId: null });
          }
          continue;
        }

        // Get the speaker from the parsed RPY content using RPY line number
        const speakerTag = speakerByLineNumber.get(line.rpyLineNumber) || null;

        // Clear stale speakerId for lines with no matching speaker tag
        if (!speakerTag) {
          if (line.speakerId) {
            updates.push({ lineId: line.id, speakerId: null });
          }
          continue;
        }

        if (!this.shouldLinkTag(speakerTag, excludedTags)) {
          // Set to null for excluded/special tags
          updates.push({ lineId: line.id, speakerId: null });
          continue;
        }

        // Try exact match
        let characterId = characterByTag.get(speakerTag);

        // Try case-insensitive match
        if (!characterId) {
          characterId = characterByTagLower.get(speakerTag.toLowerCase());
        }

        if (characterId) {
          updates.push({ lineId: line.id, speakerId: characterId });
          linkedCount++;
        } else {
          const currentCount = unmatchedTagCounts.get(speakerTag) || 0;
          unmatchedTagCounts.set(speakerTag, currentCount + 1);
          updates.push({ lineId: line.id, speakerId: null });
        }
      }
    }

    return { updates, linkedCount, unmatchedTagCounts };
  }

  /**
   * Apply batched speakerId updates using a single CASE-based UPDATE
   */
  private async applySpeakerUpdates(
    updates: Array<{ lineId: string; speakerId: string | null }>,
    db: DatabaseConnection
  ): Promise<void> {
    if (updates.length === 0) return;

    // Chunk to stay under PostgreSQL parameter limit (~65535)
    const CHUNK_SIZE = 2000;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const caseClauses = sql.join(
        // Cast THEN values to uuid: Drizzle binds JS strings as `text`,
        // and a CASE mixing uuid-looking text with NULL is inferred as
        // text — which then fails against speaker_id uuid. See import
        // errors: column "speaker_id" is of type uuid but expression
        // is of type text.
        chunk.map((u) => sql`WHEN ${u.lineId} THEN ${u.speakerId}::uuid`),
        sql` `
      );
      await db
        .update(labelLines)
        .set({
          speakerId: sql`CASE ${labelLines.id} ${caseClauses} END`,
          updatedAt: new Date(),
        })
        .where(
          inArray(
            labelLines.id,
            chunk.map((u) => u.lineId)
          )
        );
    }
  }

  /**
   * Build the SpeakerLinkResult from unmatched tags and linked count
   */
  private buildLinkResult(
    unmatchedTagCounts: Map<string, number>,
    linkedCount: number
  ): SpeakerLinkResult {
    const conflicts: SpeakerLinkConflict[] = Array.from(
      unmatchedTagCounts.keys()
    ).map((speakerTag) => ({
      speakerTag,
      matchedCharacterId: null,
      lineCount: unmatchedTagCounts.get(speakerTag) || 0,
    }));

    return {
      linked: linkedCount,
      unmatched: Array.from(unmatchedTagCounts.keys()),
      conflicts,
    };
  }

  /**
   * Link speakers to lines for labels in a project
   *
   * This method parses the original RPY files to extract speaker information,
   * then links speakers to label_lines by matching character tags.
   *
   * Process:
   * 1. Get all labels and their project_files
   * 2. Parse RPY files to extract dialogue entries with speakers
   * 3. Match speakers to characters by renpyTag
   * 4. Update label_lines.speakerId for each dialogue line
   *
   * @param tx - Optional transaction. When provided, all DB operations use
   *   this transaction instead of starting a new connection, allowing the
   *   caller to wrap speaker linking in an atomic unit of work.
   */
  async linkSpeakersToLines(
    projectId: string,
    labelIds: string[],
    excludedTags: Set<string> = new Set(),
    tx?: Transaction
  ): Promise<SpeakerLinkResult> {
    const db = tx ?? getDb();

    if (labelIds.length === 0) {
      return { linked: 0, unmatched: [], conflicts: [] };
    }

    const [
      { characterByTag, characterByTagLower },
      { labelsWithFiles, linesByLabel },
    ] = await Promise.all([
      this.buildCharacterMaps(projectId, db),
      this.loadLabelsAndLines(labelIds, db),
    ]);
    const { projectFileMap, parsedFileCache } =
      await this.loadAndParseProjectFiles(labelsWithFiles, db);
    const { updates, linkedCount, unmatchedTagCounts } =
      await this.processLabelSpeakers(
        labelsWithFiles,
        projectFileMap,
        parsedFileCache,
        linesByLabel,
        characterByTag,
        characterByTagLower,
        excludedTags
      );
    await this.applySpeakerUpdates(updates, db);
    return this.buildLinkResult(unmatchedTagCounts, linkedCount);
  }

  /**
   * Get all unique speaker tags from a label's lines
   * Parses RPY files directly to extract speaker information
   */
  async getSpeakerTagsForLabel(labelId: string): Promise<string[]> {
    const db = getDb();

    // Get the label with its project file
    const [label] = await db
      .select({
        labelName: labels.labelName,
        projectFileId: labels.projectFileId,
      })
      .from(labels)
      .where(eq(labels.id, labelId))
      .limit(1);

    if (!label?.projectFileId || !label.labelName) return [];

    // Get the project file content
    const [projectFile] = await db
      .select({
        content: projectFiles.content,
        filePath: projectFiles.filePath,
      })
      .from(projectFiles)
      .where(eq(projectFiles.id, label.projectFileId))
      .limit(1);

    if (!projectFile?.content) return [];

    // Parse the RPY file
    const parsed = parseRPYFileWithLabels(
      projectFile.content,
      projectFile.filePath
    );

    // Find the label in the parsed file
    const parsedLabel = parsed.labels.find((l) => l.label === label.labelName);
    if (!parsedLabel) return [];

    // Convert to BranchForge format to get entries
    const labelData = convertToBranchForgeFormatFromLabels(
      parsed,
      label.labelName,
      projectFile.content
    );

    // Extract unique speaker tags
    const speakerTags = new Set<string>();
    for (const entry of labelData.entries) {
      if (entry.type === "DIALOGUE" && entry.speaker) {
        speakerTags.add(entry.speaker);
      }
    }

    return Array.from(speakerTags);
  }

  /**
   * Get statistics about speaker linking for a project
   */
  async getLinkingStats(projectId: string): Promise<{
    totalLines: number;
    linkedLines: number;
    unlinkedLines: number;
    uniqueSpeakers: number;
  }> {
    const db = getDb();

    // Execute all three count queries in parallel for better performance
    const [totalResult, linkedResult, uniqueSpeakersResult] = await Promise.all(
      [
        // Get total lines for project (via labels)
        db
          .select({ count: sql<number>`count(*)` })
          .from(labelLines)
          .innerJoin(labels, eq(labelLines.labelId, labels.id))
          .where(
            and(eq(labels.projectId, projectId), isNull(labelLines.deletedAt))
          )
          .then((rows) => rows[0]),

        // Get linked lines for project
        db
          .select({ count: sql<number>`count(*)` })
          .from(labelLines)
          .innerJoin(labels, eq(labelLines.labelId, labels.id))
          .where(
            and(
              eq(labels.projectId, projectId),
              isNull(labelLines.deletedAt),
              sql`${labelLines.speakerId} IS NOT NULL`
            )
          )
          .then((rows) => rows[0]),

        // Get unique speakers for project
        db
          .select({
            count: sql<number>`count(distinct ${labelLines.speakerId})`,
          })
          .from(labelLines)
          .innerJoin(labels, eq(labelLines.labelId, labels.id))
          .where(
            and(
              eq(labels.projectId, projectId),
              isNull(labelLines.deletedAt),
              sql`${labelLines.speakerId} IS NOT NULL`
            )
          )
          .then((rows) => rows[0]),
      ]
    );

    const totalLines = Number(totalResult?.count) || 0;
    const linkedLines = Number(linkedResult?.count) || 0;
    const uniqueSpeakers = Number(uniqueSpeakersResult?.count) || 0;

    return {
      totalLines,
      linkedLines,
      unlinkedLines: totalLines - linkedLines,
      uniqueSpeakers,
    };
  }
}

// Export singleton instance
export const characterLinkerService = new CharacterLinkerService();
