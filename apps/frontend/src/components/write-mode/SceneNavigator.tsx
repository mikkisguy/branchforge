/**
 * SceneNavigator Component
 *
 * Left sidebar for navigating scenes in WriteMode.
 * Matches app design system with theme colors and simple styling.
 */

import { useMemo } from "react";
import type { PublicLabel } from "@branchforge/shared";

interface SceneNavigatorProps {
  labels: PublicLabel[];
  activeLabelId: string | null;
  onSelect: (labelId: string) => void;
}

export function SceneNavigator({
  labels,
  activeLabelId,
  onSelect,
}: SceneNavigatorProps) {
  const groupedLabels = useMemo(() => {
    const groups = new Map<string, PublicLabel[]>();

    for (const label of labels) {
      const key =
        label.groupType && label.groupValue
          ? `${label.groupType}: ${label.groupValue}`
          : "Uncategorized";

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(label);
    }

    const sortedGroups = new Map<string, PublicLabel[]>();
    const groupKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Uncategorized") {
        return 1;
      }
      if (b === "Uncategorized") {
        return -1;
      }
      return a.localeCompare(b);
    });
    for (const key of groupKeys) {
      const groupLabels = groups.get(key)!;
      groupLabels.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      sortedGroups.set(key, groupLabels);
    }

    return sortedGroups;
  }, [labels]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide">Scenes</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {labels.length} scenes
        </p>
      </div>

      <div className="p-3 space-y-4">
        {groupedLabels.size === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No scenes yet
          </p>
        ) : (
          <div className="space-y-4">
            {Array.from(groupedLabels.entries()).map(
              ([groupName, groupLabels]) => (
                <div key={groupName}>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                    {groupName}
                  </div>

                  <div className="space-y-0.5">
                    {groupLabels.map((label) => {
                      const isActive = label.id === activeLabelId;

                      return (
                        <button
                          type="button"
                          key={label.id}
                          onClick={() => onSelect(label.id)}
                          className={`w-full text-left py-2 px-2 rounded text-sm transition-all ${
                            isActive
                              ? "bg-[var(--theme-color)]/10 text-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              aria-label={`Status: ${label.status?.toLowerCase()}`}
                              role="img"
                              style={{
                                backgroundColor:
                                  label.status === "FINAL"
                                    ? "var(--theme-color)"
                                    : label.status === "REVIEW"
                                      ? "var(--theme-review-color)"
                                      : "var(--theme-draft-color)",
                              }}
                            />
                            <span className="truncate">{label.title}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
