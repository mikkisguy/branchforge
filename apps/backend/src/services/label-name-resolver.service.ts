/**
 * Label Name Resolver Service
 *
 * Resolves raw Ren'Py label names to database label IDs.
 * Used during import/sync to resolve jump targets and menu choices.
 */

/**
 * Resolves label names to label IDs.
 *
 * @param labels - Array of labels with id and labelName
 * @param namesToResolve - Array of label names to resolve
 * @returns Map of label name to label ID (null if not found)
 */
export function resolveLabelNames(
  labels: Array<{ id: string; labelName: string | null }>,
  namesToResolve: string[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  // Build a map of lowercase labelName -> ID for case-insensitive lookup
  const labelMap = new Map<string, string>();
  for (const label of labels) {
    if (label.labelName) {
      labelMap.set(label.labelName.toLowerCase(), label.id);
    }
  }

  // Resolve each name
  for (const name of namesToResolve) {
    const lowerName = name.toLowerCase();
    result[name] = labelMap.get(lowerName) ?? null;
  }

  return result;
}
