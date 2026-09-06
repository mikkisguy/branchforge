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
 * Renders inside the docked filters panel owned by {@link FlowFiltersDock}.
 * Collapse is handled by that dock — this component only renders the expanded
 * panel body.
 *
 * State is fully controlled by the parent so it can be serialised /
 * persisted by the surrounding FlowGraph if needed.
 */

import { useCallback, useMemo, useState } from "react";
import { Search, X, Filter, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Character } from "@branchforge/shared";
import type { LabelStatus } from "@branchforge/shared";
import {
  countActiveFilters,
  FILTER_STATUS_OPTIONS,
  type FlowGraphFilters,
} from "@/components/flow/flow-filters";

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
  /** Collapse the docked filters panel (workspace sidebar). */
  onCollapse?: () => void;
}

const statusDotClass: Record<LabelStatus, string> = {
  DRAFT: "bg-muted-foreground",
  REVIEW: "bg-amber-500",
  FINAL: "bg-[var(--theme-final-color)]",
};

export function FlowGraphFiltersPanel({
  filters,
  onChange,
  routes,
  routeColors,
  characters,
  className,
  onCollapse,
}: FlowGraphFiltersPanelProps) {
  const activeCount = countActiveFilters(filters);

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

  return (
    <section
      className={cn(
        "flex flex-col h-full min-h-0 text-sm text-foreground",
        className
      )}
      aria-label="Flow graph filters"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse filters"
          aria-expanded={true}
          title="Collapse filters"
          className="flex items-center gap-1.5 text-foreground font-medium hover:text-foreground/80 transition-colors"
        >
          <Filter
            className="w-3.5 h-3.5 text-muted-foreground"
            aria-hidden="true"
          />
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
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground transition-colors px-1"
        >
          Clear
        </button>
      </div>

      <div className="p-3 space-y-4 overflow-y-auto flex-1 min-h-0">
        <FilterSection label="Search">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
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
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </FilterSection>

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
                      ? "bg-accent border-border text-accent-foreground"
                      : "bg-raised/40 border-border text-muted-foreground hover:text-foreground hover:border-border"
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

        <FilterSection label="Route">
          <MultiSelectList<string | null>
            options={routes.map((r) => ({
              value: r.key,
              label: r.label,
              color: r.key ? routeColors?.get(r.key) : undefined,
            }))}
            selected={filters.routeKeys}
            onToggle={toggleRoute}
            emptyText="No routes in this project."
          />
        </FilterSection>

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
    </section>
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
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
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

function MultiSelectList<V extends string | null>({
  options,
  selected,
  onToggle,
  emptyText,
}: MultiSelectListProps<V>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleLimit = 6;
  const hiddenCount = Math.max(0, options.length - visibleLimit);
  const visible = useMemo(
    () =>
      isExpanded || hiddenCount === 0
        ? options
        : options.slice(0, visibleLimit),
    [isExpanded, hiddenCount, options]
  );

  if (options.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">{emptyText}</div>
    );
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
                    ? "bg-accent/70 text-accent-foreground"
                    : "text-muted-foreground hover:bg-raised/60 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center",
                    isSelected
                      ? "bg-[var(--theme-color)] border-[var(--theme-color)]"
                      : "border-border"
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
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
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
