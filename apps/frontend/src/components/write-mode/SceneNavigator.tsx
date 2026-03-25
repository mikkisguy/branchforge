/**
 * SceneNavigator Component
 *
 * Left sidebar for navigating scenes in WriteMode.
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
  // Group labels by groupType (act, chapter, etc.)
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

    // Sort groups by name and labels within groups by sequence
    const sortedGroups = new Map<string, PublicLabel[]>();
    const groupKeys = Array.from(groups.keys()).sort((a, b) => {
      // Ensure "Uncategorized" always comes last
      if (a === "Uncategorized") {
        return 1;
      }
      if (b === "Uncategorized") {
        return -1;
      }

      // Otherwise, sort alphabetically
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
    <div className="space-y-1 py-4">
      <div className="text-xs font-display tracking-wider text-foreground/50 mb-4 pb-2 border-b border-border/30">
        SCENES
      </div>

      {groupedLabels.size === 0 ? (
        <p className="text-sm text-muted-foreground/50 text-center py-4">
          No scenes yet
        </p>
      ) : (
        <div className="space-y-4">
          {Array.from(groupedLabels.entries()).map(
            ([groupName, groupLabels]) => (
              <div key={groupName}>
                {/* Group Header */}
                <div className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-2 px-2">
                  {groupName}
                </div>

                {/* Group Labels */}
                <div className="space-y-0.5">
                  {groupLabels.map((label) => (
                    <button
                      type="button"
                      key={label.id}
                      onClick={() => onSelect(label.id)}
                      className={`w-full text-left py-2 px-2 rounded text-sm transition-all ${
                        activeLabelId === label.id
                          ? "bg-foreground/10 text-foreground font-medium"
                          : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-1 h-1 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              label.status === "FINAL"
                                ? "var(--theme-color)"
                                : label.status === "REVIEW"
                                  ? "var(--theme-review-color)"
                                  : "var(--theme-draft-color)",
                          }}
                          aria-label={`${label.status?.toLowerCase() ?? "draft"} status`}
                        />
                        <span className="truncate">{label.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
