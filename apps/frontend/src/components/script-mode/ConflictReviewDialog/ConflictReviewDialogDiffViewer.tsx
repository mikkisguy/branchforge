/**
 * Conflict Review Dialog - Diff Viewer
 *
 * Side-by-side comparison of local vs remote conflict content,
 * resolution controls, and navigation between conflicts.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConflictInfo, ContentItem } from "@/lib/api/gitlab";

// ============================================================================
// Helpers
// ============================================================================

function formatContent(content: ContentItem[] | undefined): string {
  if (!content || content.length === 0) return "Empty";
  return content
    .map((line) => {
      if (line.speaker) {
        return `${line.speaker}: "${line.text}"`;
      }
      return `"${line.text}"`;
    })
    .join("\n");
}

function getConflictTypeLabel(type: ConflictInfo["type"]): string {
  switch (type) {
    case "dialogue_mismatch":
      return "Dialogue differs between versions";
    case "new_remote_label":
      return "New label in GitLab";
    case "deleted_remote_label":
      return "Label deleted in GitLab";
    case "choice_mismatch":
      return "Branching choices differ";
    default:
      return "Unknown conflict type";
  }
}

// ============================================================================
// Props
// ============================================================================

interface ConflictReviewDialogDiffViewerProps {
  currentConflict: ConflictInfo;
  currentResolution: "local" | "remote" | "skip" | undefined;
  currentIndex: number;
  totalCount: number;
  isLoading: boolean;
  onSetResolution: (choice: "local" | "remote" | "skip") => void;
  onGoPrevious: () => void;
  onGoNext: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConflictReviewDialogDiffViewer({
  currentConflict,
  currentResolution,
  currentIndex,
  totalCount,
  isLoading,
  onSetResolution,
  onGoPrevious,
  onGoNext,
}: ConflictReviewDialogDiffViewerProps) {
  const [mobileConflictView, setMobileConflictView] = useState<
    "local" | "remote"
  >("local");

  return (
    <div className="space-y-6">
      {/* Conflict Info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">
            Label: {currentConflict.label}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {getConflictTypeLabel(currentConflict.type)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onGoPrevious}
            disabled={currentIndex === 0 || isLoading}
            className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span>
            {currentIndex + 1} / {totalCount}
          </span>
          <button
            type="button"
            onClick={onGoNext}
            disabled={currentIndex === totalCount - 1 || isLoading}
            className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {/* Resolution Status */}
      {currentResolution && (
        <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-md text-sm flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          <span>
            Will use:{" "}
            {currentResolution === "local"
              ? "BranchForge"
              : currentResolution === "remote"
                ? "GitLab"
                : "Skipped"}{" "}
            version
          </span>
        </div>
      )}

      {/* Mobile tabbed-toggle (below sm): segmented control to switch
          between Local and Remote views — avoids two very long stacked
          panels that force excessive scrolling on narrow phones. */}
      <div className="hidden max-sm:flex items-center gap-0 border border-border/50 rounded-lg overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setMobileConflictView("local")}
          className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
            mobileConflictView === "local"
              ? "bg-accent text-accent-foreground"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Local
        </button>
        <button
          type="button"
          onClick={() => setMobileConflictView("remote")}
          className={`flex-1 px-4 py-2 text-xs font-medium transition-colors border-l border-border/50 ${
            mobileConflictView === "remote"
              ? "bg-accent text-accent-foreground"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Remote
        </button>
      </div>

      {/* Side-by-side Comparison */}
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
        {/* BranchForge Version */}
        <div
          className={`space-y-2 ${
            mobileConflictView !== "local" ? "max-sm:hidden" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">BranchForge Version</h4>
            <Button
              type="button"
              size="sm"
              variant={currentResolution === "local" ? "default" : "outline"}
              onClick={() => onSetResolution("local")}
              disabled={isLoading}
            >
              {currentResolution === "local" ? "Selected" : "Use This"}
            </Button>
          </div>
          <div className="p-4 bg-muted/30 rounded-md border border-border/30">
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {formatContent(currentConflict.localContent)}
            </pre>
          </div>
        </div>

        {/* GitLab Version */}
        <div
          className={`space-y-2 ${
            mobileConflictView !== "remote" ? "max-sm:hidden" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">GitLab Version</h4>
            <Button
              type="button"
              size="sm"
              variant={currentResolution === "remote" ? "default" : "outline"}
              onClick={() => onSetResolution("remote")}
              disabled={isLoading}
            >
              {currentResolution === "remote" ? "Selected" : "Use This"}
            </Button>
          </div>
          <div className="p-4 bg-muted/30 rounded-md border border-border/30">
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {formatContent(currentConflict.remoteContent)}
            </pre>
          </div>
        </div>
      </div>

      {/* Skip Option */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSetResolution("skip")}
          disabled={isLoading}
          className={
            currentResolution === "skip" ? "text-muted-foreground" : ""
          }
        >
          Skip this conflict
        </Button>
      </div>
    </div>
  );
}
