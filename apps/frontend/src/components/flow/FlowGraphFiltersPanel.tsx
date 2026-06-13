/**
 * FlowGraphFilters - Sidebar panel that drives the flow-graph filtering +
 * search experience. Hosts:
 *
 * - Search box (highlights matches, dims non-matches)
 * - Route multi-select (including an "Unassigned" bucket for `null` routeKeys)
 * - Status toggle row
 * - Character multi-select
 * - "Clear all" + active-filter count badge
 *
 * The whole panel can be collapsed to a single icon button so it doesn't
 * cover the graph when the user isn't actively filtering.
 *
 * State is fully controlled by the parent so it can be serialised /
 * persisted by the surrounding FlowGraph if needed.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Search, X, Filter, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Character } from "@branchforge/shared";
import type { LabelStatus } from "@branchforge/shared";
import {
  countActiveFilters,
  FILTER_STATUS_OPTIONS,
  type FlowGraphFilters,
} from "./flow-filters";

export interface FlowGraphFiltersPanelProps {
  filters: FlowGraphFilters;
  onChange: (next: FlowGraphFilters) => void;
  /** Available route options. Includes a `null` entry for "unassigned". */
  routes: ReadonlyArray<{ key: string | null; label: string }>;
  /**
   * Optional map of routeKey → hex color (the same colors used for
   * node borders on the graph). When provided, real route rows get a
   * colored swatch so they visually pair with their nodes.
   */
  routeColors?: ReadonlyMap<string, string>;
  characters: Character[];
  className?: string;
}

const statusDotClass: Record<LabelStatus, string> = {
  DRAFT: "bg-yellow-400",
  REVIEW: "bg-blue-400",
  FINAL: "bg-green-400",
};

export function FlowGraphFiltersPanel({
  filters,
  onChange,
  routes,
  routeColors,
  characters,
  className,
}: FlowGraphFiltersPanelProps) {
  const activeCount = countActiveFilters(filters);
  // Collapsed by default — most of the time the user wants to see the
  // graph, not the filter chrome.
  const [isCollapsed, setIsCollapsed] = useState(true);

  const update = useCallback(
    (patch: Partial<FlowGraphFilters>) => {
      onChange({ ...filters, ...patch });
    },
    [filters, onChange]
  );

  const clearAll = useCallback(() => {
    onChange({
      routeKeys: new Set(),
      statuses: new Set(),
      characterIds: new Set(),
      searchQuery: "",
    });
  }, [onChange]);

  const toggleRoute = useCallback(
    (key: string | null) => {
      const next = new Set<string | null>(filters.routeKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      update({ routeKeys: next });
    },
    [filters.routeKeys, update]
  );

  const toggleStatus = useCallback(
    (status: LabelStatus) => {
      const next = new Set(filters.statuses);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      update({ statuses: next });
    },
    [filters.statuses, update]
  );

  const toggleCharacter = useCallback(
    (id: string) => {
      const next = new Set(filters.characterIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      update({ characterIds: next });
    },
    [filters.characterIds, update]
  );

  // Collapsed view: a compact button that reopens the panel. Uses the
  // same ChevronRight icon the rest of the app uses for "expand".
  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        aria-label="Open filters"
        aria-expanded={false}
        title="Open filters"
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 hover:text-white transition-colors shadow-lg",
          className
        )}
      >
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--theme-color)]/20 text-[var(--theme-color)] text-[10px] font-semibold"
            aria-label={`${activeCount} active filter${activeCount === 1 ? "" : "s"}`}
          >
            {activeCount}
          </span>
        )}
        <ChevronRight
          className="w-4 h-4 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "w-64 max-h-full flex flex-col rounded-lg border border-slate-600 bg-slate-900/95 backdrop-blur-sm shadow-xl",
        "text-slate-200 text-sm",
        className
      )}
      role="region"
      aria-label="Flow graph filters"
    >
      {/* Header. The collapse toggle lives in the top-left of the panel
          (next to the title) and uses the same ChevronDown (open) /
          ChevronRight (closed) convention as the rest of the app — see
          `CollapsibleSection` and the file-tree expanders. */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60 shrink-0">
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse filters"
          aria-expanded={true}
          title="Collapse filters"
          className="flex items-center gap-1.5 text-slate-100 font-medium hover:text-white transition-colors"
        >
          <Filter className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--theme-color)]/20 text-[var(--theme-color)] text-[10px] font-semibold"
              aria-label={`${activeCount} active filter${activeCount === 1 ? "" : "s"}`}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown
            className="w-4 h-4 text-muted-foreground transition-transform duration-200"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={activeCount === 0}
          className="text-xs text-slate-400 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 transition-colors px-1"
        >
          Clear
        </button>
      </div>

      <div className="p-3 space-y-4 overflow-y-auto flex-1 min-h-0">
        {/* Search */}
        <FilterSection label="Search">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <Input
              size="sm"
              value={filters.searchQuery}
              onChange={(e) => update({ searchQuery: e.target.value })}
              placeholder="Title or label name"
              className="pl-7 pr-7 h-7 text-xs"
              aria-label="Search labels"
            />
            {filters.searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => update({ searchQuery: "" })}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100 p-0.5 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </FilterSection>

        {/* Status */}
        <FilterSection label="Status">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_STATUS_OPTIONS.map((status) => {
              const active = filters.statuses.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                    active
                      ? "bg-slate-700 border-slate-500 text-white"
                      : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full",
                      statusDotClass[status]
                    )}
                    aria-hidden="true"
                  />
                  {status}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Routes */}
        <FilterSection label="Route">
          <MultiSelectList<string | null>
            options={routes.map((r) => ({
              value: r.key,
              label: r.label,
              // Real routes get a colored swatch matching the node's
              // border on the graph; the "Unassigned" bucket has no
              // color, so it renders without a swatch.
              color: r.key ? routeColors?.get(r.key) : undefined,
            }))}
            selected={filters.routeKeys}
            onToggle={toggleRoute}
            emptyText="No routes in this project."
          />
        </FilterSection>

        {/* Characters */}
        <FilterSection label="Character">
          <MultiSelectList
            options={characters.map((c) => ({
              value: c.id,
              label: c.displayName || c.name,
              color: c.color,
            }))}
            selected={filters.characterIds}
            onToggle={toggleCharacter}
            emptyText="No characters defined yet."
          />
        </FilterSection>
      </div>
    </div>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

interface MultiSelectListProps<V extends string | null> {
  options: ReadonlyArray<{
    value: V;
    label: string;
    color?: string;
  }>;
  selected: ReadonlySet<V>;
  onToggle: (value: V) => void;
  emptyText: string;
}

/**
 * Compact multi-select checklist. Renders all options inline (no
 * virtualisation) — flow graphs are bounded by label count, typically
 * under a few hundred routes / characters.
 */
function MultiSelectList<V extends string | null>({
  options,
  selected,
  onToggle,
  emptyText,
}: MultiSelectListProps<V>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleLimit = 6;
  const visible = useMemo(
    () =>
      isExpanded || options.length <= visibleLimit
        ? options
        : options.slice(0, visibleLimit),
    [isExpanded, options]
  );
  const hiddenCount = options.length - visible.length;

  // Reset expansion when the option list shrinks below the threshold so
  // toggling items in a small list doesn't leave it collapsed.
  const lastOptionsLen = useRef(options.length);
  useEffect(() => {
    if (
      lastOptionsLen.current > visibleLimit &&
      options.length <= visibleLimit
    ) {
      setIsExpanded(false);
    }
    lastOptionsLen.current = options.length;
  }, [options.length]);

  if (options.length === 0) {
    return <div className="text-xs text-slate-500 italic">{emptyText}</div>;
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {visible.map((opt) => {
          const isSelected = selected.has(opt.value);
          return (
            <li key={String(opt.value)}>
              <button
                type="button"
                onClick={() => onToggle(opt.value)}
                aria-pressed={isSelected}
                className={cn(
                  "w-full flex items-center gap-2 px-1.5 py-1 rounded text-left text-xs transition-colors",
                  isSelected
                    ? "bg-slate-700/70 text-slate-100"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                )}
              >
                <span
                  className={cn(
                    "flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center",
                    isSelected
                      ? "bg-[var(--theme-color)] border-[var(--theme-color)]"
                      : "border-slate-500"
                  )}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg
                      viewBox="0 0 12 12"
                      className="w-2.5 h-2.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M2 6.5l2.5 2.5L10 3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {opt.color && (
                  <span
                    className="flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: opt.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate flex-1">{opt.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              !isExpanded && "-rotate-90"
            )}
            aria-hidden="true"
          />
          {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
