/**
 * SceneNavigator Component
 *
 * Left sidebar for navigating scenes in WriteMode.
 * Matches app design system with theme colors and simple styling.
 */

import { useMemo } from "react";
import type { PublicLabel } from "@branchforge/shared";
import { Sparkles } from "lucide-react";

interface SceneNavigatorProps {
  labels: PublicLabel[];
  activeLabelId: string | null;
  onSelect: (labelId: string) => void;
  projectName?: string;
  projectLabelCount?: number;
}

export function SceneNavigator({
  labels,
  activeLabelId,
  onSelect,
  projectName,
  projectLabelCount,
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
      {/* Project Info Header */}
      <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-[var(--theme-color)] flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium block truncate">
              {projectName || "Write Mode"}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectLabelCount ?? labels.length} scene
              {(projectLabelCount ?? labels.length) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Scene List */}
      <div className="p-3 space-y-2">
        {groupedLabels.size === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No scenes yet
          </p>
        ) : (
          <div className="space-y-3">
            {Array.from(groupedLabels.entries()).map(
              ([groupName, groupLabels]) => (
                <div key={groupName}>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-2">
                    {groupName}
                  </div>

                  <div className="space-y-1.5">
                    {groupLabels.map((label) => {
                      const isActive = label.id === activeLabelId;

                      return (
                        <button
                          key={label.id}
                          onClick={() => onSelect(label.id)}
                          aria-pressed={isActive}
                          className={`group relative py-2.5 px-3 rounded-lg border transition-all cursor-pointer w-full text-left ${
                            isActive
                              ? "bg-[var(--theme-color)]/10 border-[var(--theme-color)] shadow-md"
                              : "bg-card/50 border-border hover:shadow-sm"
                          }`}
                        >
                          {/* Status Indicator */}
                          <div
                            className="absolute left-0 top-2 bottom-2 w-1 rounded-r"
                            style={{
                              backgroundColor:
                                label.status === "FINAL"
                                  ? "var(--theme-color)"
                                  : label.status === "REVIEW"
                                  ? "var(--theme-review-color)"
                                  : "var(--theme-draft-color)",
                              opacity: isActive ? 1 : 0.5,
                            }}
                          />

                          {/* Scene Title */}
                          <div className="ml-2.5" title={label.title}>
                            <h3
                              className={`text-sm font-medium truncate ${
                                isActive
                                  ? "text-foreground"
                                  : "text-muted-foreground group-hover:text-foreground"
                              }`}
                            >
                              <span
                                className={`text-xs font-mono pr-2 ${
                                  isActive
                                    ? "text-[var(--theme-color)]"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {String(label.labelNumber).padStart(2, "0")}
                              </span>
                              {label.title}
                            </h3>
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
