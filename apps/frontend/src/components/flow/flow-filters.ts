/**
 * Flow graph filter state and pure-function helpers.
 *
 * Centralises the filter shape so the UI, the predicate, and the tests all
 * agree on what "active filter" means. Filters are deliberately additive:
 * an empty set / empty string means "no constraint", not "match nothing".
 */

import type { FlowNode, LabelStatus } from "@branchforge/shared";

/**
 * Active filter state for the flow graph. Every field is an additive
 * constraint: when empty / `null`, the filter does not constrain the result.
 */
export interface FlowGraphFilters {
  /**
   * Multi-select of route keys. A `null` entry represents the
   * "Unassigned" bucket (labels with no `routeKey`). Nodes whose
   * `routeKey` is in this set match — a `null` in the set matches a
   * `null` on the node.
   */
  routeKeys: ReadonlySet<string | null>;
  /** Multi-select of label statuses. Nodes whose `status` is in this set match. */
  statuses: ReadonlySet<LabelStatus>;
  /**
   * Multi-select of character IDs. Nodes that have at least one of these
   * characters speaking in them match.
   */
  characterIds: ReadonlySet<string>;
  /** Free-text search. Matches against `title` and `labelName` (case-insensitive). */
  searchQuery: string;
}

export const EMPTY_FLOW_FILTERS: FlowGraphFilters = {
  routeKeys: new Set(),
  statuses: new Set(),
  characterIds: new Set(),
  searchQuery: "",
};

/** Statuses offered by the filter UI, in display order. */
export const FILTER_STATUS_OPTIONS: readonly LabelStatus[] = [
  "DRAFT",
  "REVIEW",
  "FINAL",
];

/** `true` when no field is constraining the result. */
export function isFlowFilterEmpty(filters: FlowGraphFilters): boolean {
  return (
    filters.routeKeys.size === 0 &&
    filters.statuses.size === 0 &&
    filters.characterIds.size === 0 &&
    filters.searchQuery.trim().length === 0
  );
}

/**
 * Total number of active constraints. Used by the "filter count" badge.
 *
 * - Search counts as 1 even though it can match many things.
 * - Each multi-select set contributes 0 if empty, 1 if non-empty.
 */
export function countActiveFilters(filters: FlowGraphFilters): number {
  let count = 0;
  if (filters.routeKeys.size > 0) count += 1;
  if (filters.statuses.size > 0) count += 1;
  if (filters.characterIds.size > 0) count += 1;
  if (filters.searchQuery.trim().length > 0) count += 1;
  return count;
}

/**
 * Returns the subset of `nodes` that satisfies every active filter.
 *
 * Pure / referentially safe: callers can keep this in a `useMemo` keyed on
 * `nodes` + `filters`.
 */
export function filterFlowNodes(
  nodes: readonly FlowNode[],
  filters: FlowGraphFilters
): FlowNode[] {
  if (isFlowFilterEmpty(filters)) return nodes.slice();

  const trimmedQuery = filters.searchQuery.trim().toLowerCase();

  return nodes.filter((node) => {
    if (filters.routeKeys.size > 0) {
      // Set membership: a node with routeKey null matches a null entry in
      // the set; a node with a real key matches a real key. We use the
      // set's `.has` method (not `==`) so it honours `null` exactly.
      const nodeKey = node.routeKey ?? null;
      if (!filters.routeKeys.has(nodeKey)) {
        return false;
      }
    }

    if (filters.statuses.size > 0) {
      if (!node.status || !filters.statuses.has(node.status)) {
        return false;
      }
    }

    if (filters.characterIds.size > 0) {
      if (node.characterIds.length === 0) return false;
      const nodeCharSet = new Set(node.characterIds);
      let matched = false;
      for (const id of filters.characterIds) {
        if (nodeCharSet.has(id)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    if (trimmedQuery.length > 0) {
      const title = node.title.toLowerCase();
      const labelName = node.labelName?.toLowerCase() ?? "";
      if (!title.includes(trimmedQuery) && !labelName.includes(trimmedQuery)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Prune filter selections that no longer reference valid keys.
 * Derived during render to avoid an extra render cascade from a useEffect.
 */
export function pruneFlowFilters(
  filters: FlowGraphFilters,
  validRouteKeys: ReadonlySet<string | null>,
  validCharacterIds: ReadonlySet<string>
): FlowGraphFilters {
  const nextRouteKeys = new Set<string | null>();
  for (const k of filters.routeKeys) {
    if (validRouteKeys.has(k)) nextRouteKeys.add(k);
  }
  const nextCharacterIds = new Set<string>();
  for (const id of filters.characterIds) {
    if (validCharacterIds.has(id)) nextCharacterIds.add(id);
  }

  if (
    nextRouteKeys.size === filters.routeKeys.size &&
    nextCharacterIds.size === filters.characterIds.size
  ) {
    return filters;
  }
  return {
    ...filters,
    routeKeys: nextRouteKeys,
    characterIds: nextCharacterIds,
  };
}
