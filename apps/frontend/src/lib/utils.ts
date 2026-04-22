import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Creates a CSS color string with the specified alpha (transparency) percentage.
 * Uses CSS color-mix() which works with all color formats:
 * - Hex colors: #ff0000
 * - RGB/RGBA: rgb(255, 0, 0)
 * - HSL/HSLA: hsl(0, 100%, 50%)
 * - CSS variables: var(--theme-color)
 *
 * @param color - The base color string (any valid CSS color)
 * @param percentage - The opacity percentage (0-100)
 * @returns A CSS color-mix() expression string
 *
 * @example
 * withAlpha("#ff0000", 15) // "color-mix(in srgb, #ff0000 15%, transparent)"
 * withAlpha("var(--theme-color)", 30) // "color-mix(in srgb, var(--theme-color) 30%, transparent)"
 * withAlpha("rgb(255, 0, 0)", 50) // "color-mix(in srgb, rgb(255, 0, 0) 50%, transparent)"
 */
export function withAlpha(color: string, percentage: number): string {
  const clampedPercentage = Number.isFinite(percentage)
    ? Math.max(0, Math.min(100, percentage))
    : 100;
  return `color-mix(in srgb, ${color} ${clampedPercentage}%, transparent)`;
}

/**
 * Formats a date string or Date object into a localized date string.
 * Uses date-fns with explicit format, but output is rendered in the user's
 * local timezone and may vary by location.
 *
 * @param date - The date to format (string or Date object)
 * @returns A formatted date string in "MMM d, yyyy" format (e.g., "Jan 15, 2024")
 *          Note: The date is displayed in the user's local timezone
 *
 * @example
 * formatDate("2024-01-15T10:30:00Z") // "Jan 15, 2024" (varies by timezone)
 * formatDate(new Date("2024-01-15")) // "Jan 15, 2024"
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) {
    return "Invalid date";
  }
  return format(dateObj, "MMM d, yyyy");
}

/**
 * Formats a byte count into a human-readable file size string.
 * Automatically selects the appropriate unit (B, KB, MB).
 *
 * @param bytes - The number of bytes to format
 * @returns A formatted string with the appropriate unit
 *
 * @example
 * formatFileSize(500) // "500 B"
 * formatFileSize(2048) // "2.0 KB"
 * formatFileSize(5242880) // "5.0 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
