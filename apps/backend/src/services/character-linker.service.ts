/**
 * Character Linker Service
 *
 * Links character tags in dialogue to labelLines.speakerId.
 * Handles exact matches, case-insensitive fallback, and special characters.
 */

import { getDb } from '../db/index.js';
import { labelLines, characters, labels } from '../db/schema/index.js';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';

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
const DEFAULT_EXCLUDED_TAGS = new Set(['n', 'u', 'narrator', 'extend']);

/**
 * Character Linker Service
 */
class CharacterLinkerService {
  /**
   * Check if a speaker tag should be linked to a character
   */
  private shouldLinkTag(speakerTag: string | null, excludedTags: Set<string>): boolean {
    if (!speakerTag) return false;
    if (DEFAULT_EXCLUDED_TAGS.has(speakerTag)) return false;
    if (excludedTags.has(speakerTag)) return false;
    return true;
  }

  /**
   * Extract speaker tag from dialogue content
   * Handles RPY dialogue format: tag "text" or "text" for narration
   */
  private extractSpeakerTag(content: string, contentType: string): string | null {
    // Only process DIALOGUE type
    if (contentType !== 'DIALOGUE') return null;

    const trimmed = content.trim();

    // Try to match dialogue with speaker: tag "text"
    // Handles both single and double quotes
    const speakerMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"]*)"$/);
    if (speakerMatch) return speakerMatch[1];

    const speakerMatch2 = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+'([^']*)'$/);
    if (speakerMatch2) return speakerMatch2[1];

    // No speaker found (narration)
    return null;
  }

  /**
   * Link speakers to lines for a single label
   */
  async linkSpeakersToLines(
    projectId: string,
    labelIds: string[],
    excludedTags: Set<string> = new Set()
  ): Promise<SpeakerLinkResult> {
    const db = getDb();

    if (labelIds.length === 0) {
      return { linked: 0, unmatched: [], conflicts: [] };
    }

    // Get all characters for this project
    const projectCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));

    // Build character map by tag for fast lookups
    const characterByTag = new Map<string, string>();
    const characterByTagLower = new Map<string, string>();

    for (const char of projectCharacters) {
      characterByTag.set(char.renpyTag, char.id);
      characterByTagLower.set(char.renpyTag.toLowerCase(), char.id);
    }

    // Get all dialogue lines for these labels
    const allLines = await db
      .select({ id: labelLines.id, content: labelLines.content, contentType: labelLines.contentType })
      .from(labelLines)
      .where(
        and(
          inArray(labelLines.labelId, labelIds),
          isNull(labelLines.deletedAt)
        )
      );

    // Track unique speaker tags that couldn't be matched
    const unmatchedTags = new Set<string>();
    let linkedCount = 0;

    // Build updates in batch
    const updates: Array<{ lineId: string; speakerId: string | null }> = [];

    for (const line of allLines) {
      const speakerTag = this.extractSpeakerTag(line.content, line.contentType);

      if (!this.shouldLinkTag(speakerTag, excludedTags)) {
        // Set to null for excluded/special tags
        if (speakerTag) {
          updates.push({ lineId: line.id, speakerId: null });
        }
        continue;
      }

      if (!speakerTag) continue;

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
        unmatchedTags.add(speakerTag);
        updates.push({ lineId: line.id, speakerId: null });
      }
    }

    // Apply updates in batch
    if (updates.length > 0) {
      for (const update of updates) {
        await db
          .update(labelLines)
          .set({ speakerId: update.speakerId, updatedAt: new Date() })
          .where(eq(labelLines.id, update.lineId));
      }
    }

    // Build conflict info for unmatched tags
    const conflicts: SpeakerLinkConflict[] = Array.from(unmatchedTags).map(tag => ({
      speakerTag: tag,
      matchedCharacterId: null,
      lineCount: 0, // Would need additional query to count
    }));

    return {
      linked: linkedCount,
      unmatched: Array.from(unmatchedTags),
      conflicts,
    };
  }

  /**
   * Get all unique speaker tags from a label's lines
   */
  async getSpeakerTagsForLabel(labelId: string): Promise<string[]> {
    const db = getDb();

    const lines = await db
      .select({ content: labelLines.content, contentType: labelLines.contentType })
      .from(labelLines)
      .where(
        and(
          eq(labelLines.labelId, labelId),
          isNull(labelLines.deletedAt)
        )
      );

    const speakerTags = new Set<string>();

    for (const line of lines) {
      const speakerTag = this.extractSpeakerTag(line.content, line.contentType);
      if (speakerTag) {
        speakerTags.add(speakerTag);
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

    // Get total lines for project (via labels)
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(labelLines)
      .innerJoin(labels, eq(labelLines.labelId, labels.id))
      .where(
        and(
          eq(labels.projectId, projectId),
          isNull(labelLines.deletedAt)
        )
      );

    const totalLines = Number(totalResult?.count) || 0;

    // Get linked lines for project
    const [linkedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(labelLines)
      .innerJoin(labels, eq(labelLines.labelId, labels.id))
      .where(
        and(
          eq(labels.projectId, projectId),
          isNull(labelLines.deletedAt),
          sql`${labelLines.speakerId} IS NOT NULL`
        )
      );

    const linkedLines = Number(linkedResult?.count) || 0;

    // Get unique speakers for project
    const [uniqueSpeakersResult] = await db
      .select({ count: sql<number>`count(distinct ${labelLines.speakerId})` })
      .from(labelLines)
      .innerJoin(labels, eq(labelLines.labelId, labels.id))
      .where(
        and(
          eq(labels.projectId, projectId),
          isNull(labelLines.deletedAt),
          sql`${labelLines.speakerId} IS NOT NULL`
        )
      );

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
