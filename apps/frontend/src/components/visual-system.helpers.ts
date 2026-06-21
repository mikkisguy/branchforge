/**
 * Visual System form helpers
 *
 * Pure helpers shared between the standalone `VisualSystemDialog`
 * and the "Visual System" tab inside `ProjectSettingsDialog`.
 */

import type { VisualSystemConfig } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

/** Wire shape for the form fields. Mirrors `VisualSystemConfig` with
 *  `groupPrefixes` stringified to JSON for the textarea. */
export interface VisualSystemFormState {
  namingTemplate: string;
  defaultGroupType: string;
  labelPadding: 1 | 2;
  counterPadding: 1 | 2;
  jumpPrefixShared: string;
  placeholderBaseUrl: string;
  // Stringified JSON for editing; the dialog shows a textarea.
  groupPrefixesJson: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Sensible defaults applied on first read of the config. */
export const INITIAL_VISUAL_SYSTEM_FORM: VisualSystemFormState = {
  namingTemplate: "{route}{group}_{label}_{counter}_{slug}",
  defaultGroupType: "",
  labelPadding: 2,
  counterPadding: 2,
  jumpPrefixShared: "",
  placeholderBaseUrl: "",
  groupPrefixesJson: "{}",
};

// ============================================================================
// Helpers
// ============================================================================

/** Build the form state from a server config. */
export function toVisualSystemFormState(
  config: VisualSystemConfig
): VisualSystemFormState {
  return {
    namingTemplate: config.namingTemplate,
    defaultGroupType: config.defaultGroupType ?? "",
    labelPadding: config.labelPadding,
    counterPadding: config.counterPadding,
    jumpPrefixShared: config.jumpPrefixShared,
    placeholderBaseUrl: config.placeholderBaseUrl ?? "",
    groupPrefixesJson: config.groupPrefixes
      ? JSON.stringify(config.groupPrefixes, null, 2)
      : "{}",
  };
}

/** Parse the groupPrefixes JSON textarea into a valid object, or null. */
export function parseGroupPrefixes(raw: string): {
  value: Record<string, Record<string, string>> | null;
  error?: string;
} {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "{}") {
    return { value: null };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { value: null, error: "Group prefixes must be a JSON object" };
    }
    for (const [groupType, entries] of Object.entries(parsed)) {
      if (typeof groupType !== "string" || groupType.trim().length === 0) {
        return {
          value: null,
          error: "Group type keys must be non-empty strings",
        };
      }
      if (
        typeof entries !== "object" ||
        entries === null ||
        Array.isArray(entries)
      ) {
        return {
          value: null,
          error: `Group "${groupType}" must map to an object of prefix entries`,
        };
      }
      for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
        // Trim before length check to match the server-side
        // `.trim().min(1)` validation in visualSystemConfigSchema;
        // a whitespace-only key/value would otherwise pass client-side
        // validation and only fail at the API.
        if (typeof k !== "string" || k.trim().length === 0) {
          return {
            value: null,
            error: `Group "${groupType}" has an empty key`,
          };
        }
        if (typeof v !== "string" || v.trim().length === 0) {
          return {
            value: null,
            error: `Group "${groupType}" entry "${k}" must be a non-empty string`,
          };
        }
      }
    }
    return {
      value: parsed as Record<string, Record<string, string>>,
    };
  } catch {
    return { value: null, error: "Group prefixes JSON is not valid" };
  }
}
