/**
 * Utils Tests
 *
 * Tests for utility functions.
 */

import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn (className utility)", () => {
  it("should merge class names using clsx and tailwind-merge", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("should handle conditional classes", () => {
    expect(cn("base", true && "active", false && "inactive")).toBe(
      "base active"
    );
  });

  it("should handle undefined and null values", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("should handle empty strings", () => {
    expect(cn("base", "", "end")).toBe("base end");
  });

  it("should handle arrays", () => {
    expect(cn(["px-2", "py-1"], "block")).toBe("px-2 py-1 block");
  });

  it("should handle objects with boolean values", () => {
    expect(cn({ "px-2": true, "py-1": false, block: true })).toBe("px-2 block");
  });

  it("should merge Tailwind classes correctly (later wins for conflicting classes)", () => {
    // tailwind-merge ensures that when there are conflicts, the last one wins
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("should handle complex class combinations", () => {
    expect(
      cn("base-class", ["array-1", "array-2"], {
        "object-true": true,
        "object-false": false,
      })
    ).toBe("base-class array-1 array-2 object-true");
  });

  it("should handle deeply nested class conflicts", () => {
    // Test that tailwind-merge handles conflicts properly
    expect(
      cn("text-sm font-medium text-gray-700", "text-lg font-bold text-gray-900")
    ).toBe("text-lg font-bold text-gray-900");
  });

  it("should handle dark mode variants correctly", () => {
    // tailwind-merge keeps both dark: and non-dark: variants
    expect(cn("text-gray-900", "dark:text-gray-100")).toBe(
      "text-gray-900 dark:text-gray-100"
    );
  });

  it("should handle empty inputs", () => {
    expect(cn()).toBe("");
  });

  it("should handle only false/undefined/null inputs", () => {
    expect(cn(false, undefined, null)).toBe("");
  });
});
