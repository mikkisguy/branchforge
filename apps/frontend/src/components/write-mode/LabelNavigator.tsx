/**
 * LabelNavigator Component
 *
 * Left sidebar for navigating labels in WriteMode.
 * Groups labels by source file name with visual status indicators.
 */

import { useMemo } from "react";
import type { PublicLabel, LabelStatus } from "@branchforge/shared";
import { Sparkles, ChevronLeft, File, FolderOpen } from "lucide-react";

const STATUS_COLORS: Record<LabelStatus, string> = {
  FINAL: "var(--theme-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
};

interface LabelNavigatorProps {
  labels: PublicLabel[];
  activeLabelId: string | null;
  onSelect: (labelId: string) => void;
  projectName?: string;
  projectLabelCount?: number;
  onToggleCollapse?: () => void;
}

export function LabelNavigator({
  labels,
  activeLabelId,
  onSelect,
  projectName,
  projectLabelCount,
  onToggleCollapse,
}: LabelNavigatorProps) {
  const groupedLabels = useMemo(() => {
    const groups = new Map<string, PublicLabel[]>();

    for (const label of labels) {
      const key = label.fileName;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(label);
    }

    const sortedGroups = new Map<string, PublicLabel[]>();
    const groupKeys = Array.from(groups.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
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
      <div
        className={`sticky top-0 z-20 bg-card border-b border-border pr-4 py-3 ${onToggleCollapse ? "pl-10" : "px-4"}`}
      >
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="absolute top-2 left-2 z-30 p-1 rounded-md hover:bg-muted/80 transition-colors"
            aria-label="Collapse label navigator sidebar"
            title="Collapse label navigator sidebar"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-[var(--theme-color)] flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium block truncate">
              {projectName || "Write Mode"}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectLabelCount ?? labels.length} label
              {(projectLabelCount ?? labels.length) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Label List */}
      <div className="p-3 space-y-2">
        {groupedLabels.size === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No labels found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Import a .rpy file or create labels to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(groupedLabels.entries()).map(
              ([fileName, fileLabels]) => (
                <div key={fileName}>
                  {/* File Header */}
                  <div className="flex items-center gap-1.5 mb-1.5 px-2">
                    <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                      {fileName}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {fileLabels.length}{" "}
                      {fileLabels.length === 1 ? "label" : "labels"}
                    </span>
                  </div>

                  {/* Labels in this file */}
                  <div className="space-y-1.5">
                    {fileLabels.map((label) => {
                      const isActive = label.id === activeLabelId;
                      const statusColor =
                        STATUS_COLORS[label.status ?? "DRAFT"];

                      return (
                        <button
                          type="button"
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
                              backgroundColor: statusColor,
                              opacity: isActive ? 1 : 0.5,
                            }}
                          />

                          {/* Label Title */}
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
