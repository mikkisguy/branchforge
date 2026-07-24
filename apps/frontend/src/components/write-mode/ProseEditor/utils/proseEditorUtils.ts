/**
 * ProseEditor Utilities
 *
 * Helper functions and constants extracted from ProseEditor for reuse.
 */

import { menuLineToChoiceEntries } from "@/lib/prose-converter";
import type { DialogueEntry } from "@/lib/prose-types";
import type { LabelDetail } from "@branchforge/shared";
import type { SaveStatus } from "@/hooks/useAutosave";

// ============================================================================
// Interfaces
// ============================================================================

export interface TimezoneDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

// ============================================================================
// Constants
// ============================================================================

export const EMPTY_ARRAY: { date: string; count: number }[] = [];

// ============================================================================
// Date / Timezone Helpers
// ============================================================================

const utcDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>([
  ["UTC", utcDateFormatter],
]);

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function getDatePartsInTimezone(
  date: Date,
  timezone: string
): TimezoneDateParts {
  let formatter = dateTimeFormatCache.get(timezone);
  if (!formatter) {
    // FP: formatter is cached in dateTimeFormatCache above — built once per timezone
    // react-doctor-disable-next-line react-doctor/js-hoist-intl
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    dateTimeFormatCache.set(timezone, formatter);
  }

  const parts = formatter.formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value) || 0;
  const month = Number(parts.find((part) => part.type === "month")?.value) || 1;
  const day = Number(parts.find((part) => part.type === "day")?.value) || 1;
  const hour = Number(parts.find((part) => part.type === "hour")?.value) || 0;

  return {
    year,
    month,
    day,
    hour,
  };
}

export function getWritingDateKey(resetHour: number, timezone: string): string {
  const now = new Date();
  const tz = timezone || "UTC";

  let dateParts: TimezoneDateParts;
  try {
    dateParts = getDatePartsInTimezone(now, tz);
  } catch {
    dateParts = getDatePartsInTimezone(now, "UTC");
  }

  if (dateParts.hour >= resetHour) {
    return formatDateKey(dateParts.year, dateParts.month, dateParts.day);
  }

  const previousDate = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);

  return formatDateKey(
    previousDate.getUTCFullYear(),
    previousDate.getUTCMonth() + 1,
    previousDate.getUTCDate()
  );
}

// ============================================================================
// Entry Helpers
// ============================================================================

/**
 * Convert label lines to dialogue entries for the editor.
 */
export function convertLabelLinesToEntries(
  activeLabel: LabelDetail | undefined
): DialogueEntry[] {
  if (!activeLabel?.lines) return [];
  const result: DialogueEntry[] = [];
  for (const line of activeLabel.lines) {
    if (line.contentType === "DIALOGUE" || line.contentType === "NARRATION") {
      result.push({
        id: line.id,
        speakerId: line.speakerId,
        text: line.content,
      });
    } else if (
      line.contentType === "MENU" &&
      line.menuOptions &&
      line.menuOptions.length > 0
    ) {
      result.push(...menuLineToChoiceEntries(line));
    }
  }
  return result;
}

/**
 * Shallow clone an array of dialogue entries.
 */
export function cloneEntries(entries: DialogueEntry[]): DialogueEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

/**
 * Count total words across all dialogue entries.
 */
export function countWordsFromEntries(entries: DialogueEntry[]): number {
  return entries.reduce((count, entry) => {
    const trimmed = entry.text?.trim();
    const words = trimmed
      ? trimmed.split(/\s+/).filter((word) => word.length > 0).length
      : 0;
    return count + words;
  }, 0);
}

/**
 * Convert old ProseEditor props to SaveStatus for SaveIndicator.
 */
export function propsToSaveStatus(
  isSaving: boolean,
  saveError: boolean
): SaveStatus {
  if (saveError) return "error";
  if (isSaving) return "saving";
  return "saved";
}
