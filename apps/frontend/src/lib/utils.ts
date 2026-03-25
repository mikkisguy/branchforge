import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
