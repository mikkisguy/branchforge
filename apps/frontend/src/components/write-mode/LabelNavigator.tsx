/**
 * LabelNavigator Component
 *
 * Left sidebar for navigating labels in WriteMode.
 * Groups labels by source file name with visual status indicators.
 * Supports inline label creation.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import type { PublicLabel, LabelStatus } from "@branchforge/shared";
import {
  Sparkles,
  ChevronLeft,
  File,
  FolderOpen,
  Plus,
  Loader2,
  X,
} from "lucide-react";

const STATUS_COLORS: Record<LabelStatus, string> = {
  FINAL: "var(--theme-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
};

// ============================================================================
// Label Item Component
// ============================================================================

interface LabelItemProps {
  label: PublicLabel;
  isActive: boolean;
  onSelect: () => void;
}

function LabelItem({ label, isActive, onSelect }: LabelItemProps) {
  const statusColor = STATUS_COLORS[label.status ?? "DRAFT"];
  const statusLabel = label.status ?? "DRAFT";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={`
        relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md border transition-all
        ${
          isActive
            ? "bg-[var(--theme-color)]/10 border-[var(--theme-color)] shadow-sm"
            : "bg-card/50 border-border hover:bg-accent/50"
        }
      `}
    >
      {/* Status dot on the left */}
      <div
        className="size-2 rounded-full flex-shrink-0 ring-2 ring-background"
        style={{
          backgroundColor: statusColor,
        }}
        title={`Status: ${statusLabel}`}
      />

      {/* Label Title */}
      <div className="flex-1 min-w-0 text-left" title={label.title}>
        <h3
          className={`text-sm font-medium truncate ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {label.title}
        </h3>
      </div>
    </button>
  );
}

// ============================================================================
// Inline Create Input Component
// ============================================================================

interface InlineCreateInputProps {
  onCreate: (title: string) => Promise<void>;
  onCancel: () => void;
  isCreating: boolean;
}

const LABEL_INPUT_ID = "inline-label-title-input";

function InlineCreateInput({
  onCreate,
  onCancel,
  isCreating,
}: InlineCreateInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Label title is required");
      return;
    }

    try {
      setError(null);
      await onCreate(trimmed);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create label");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="p-2">
      <label htmlFor={LABEL_INPUT_ID} className="sr-only">
        Label title
      </label>
      <div className="flex items-center gap-2 min-w-0">
        <input
          id={LABEL_INPUT_ID}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Label title..."
          className="flex-1 min-w-0 px-3 py-2 border rounded-md text-sm bg-background"
          disabled={isCreating}
        />
        {isCreating ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-accent rounded"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-1.5 px-1">{error}</p>}
    </div>
  );
}

// ============================================================================
// File Group Component
// ============================================================================

interface FileGroupProps {
  fileName: string;
  projectFileId: string;
  labels: PublicLabel[];
  activeLabelId: string | null;
  onLabelSelect: (labelId: string) => void;
  onCreateLabel?: (data: {
    title: string;
    projectFileId: string;
  }) => Promise<unknown>;
  isCreatingLabel?: boolean;
}

function FileGroup({
  fileName,
  projectFileId: fileGroupId,
  labels,
  activeLabelId,
  onLabelSelect,
  onCreateLabel,
  isCreatingLabel,
}: FileGroupProps) {
  const [showInput, setShowInput] = useState(false);

  const handleCreate = async (title: string) => {
    await onCreateLabel?.({
      title,
      projectFileId: fileGroupId,
    });
    setShowInput(false);
  };

  return (
    <div className="mb-4">
      {/* File Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/20">
        <File className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {fileName}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
          {labels.length}
        </span>
      </div>

      {/* Label list */}
      <div className="space-y-1">
        {labels.map((label) => (
          <LabelItem
            key={label.id}
            label={label}
            isActive={activeLabelId === label.id}
            onSelect={() => onLabelSelect(label.id)}
          />
        ))}
      </div>

      {/* Create button or input */}
      {showInput ? (
        <InlineCreateInput
          onCreate={handleCreate}
          onCancel={() => setShowInput(false)}
          isCreating={isCreatingLabel ?? false}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="flex items-center gap-2 mt-2 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={isCreatingLabel}
        >
          <Plus className="size-3.5" />
          Add label
        </button>
      )}
    </div>
  );
}

interface LabelNavigatorProps {
  labels: PublicLabel[];
  activeLabelId: string | null;
  onSelect: (labelId: string) => void;
  projectName?: string;
  projectLabelCount?: number;
  onToggleCollapse?: () => void;
  // Create
  onCreateLabel?: (data: {
    title: string;
    projectFileId: string;
  }) => Promise<unknown>;
  isCreatingLabel?: boolean;
}

export function LabelNavigator({
  labels,
  activeLabelId,
  onSelect,
  projectName,
  projectLabelCount,
  onToggleCollapse,
  onCreateLabel,
  isCreatingLabel,
}: LabelNavigatorProps) {
  const groupedLabels = useMemo(() => {
    const groups = new Map<string, PublicLabel[]>();

    for (const label of labels) {
      const key = label.projectFileId;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(label);
    }

    const sortedGroups = new Map<string, PublicLabel[]>();
    const groupEntries = Array.from(groups.entries());
    groupEntries.sort(([, aLabels], [, bLabels]) => {
      const aName = aLabels[0]?.fileName ?? "";
      const bName = bLabels[0]?.fileName ?? "";
      return aName.localeCompare(bName);
    });
    for (const [key, groupLabels] of groupEntries) {
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
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="size-7 rounded bg-[var(--theme-color)] flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="size-4 text-white" />
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
            <FolderOpen className="size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No labels found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Import a .rpy file or create labels to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(groupedLabels.entries()).map(
              ([projectFileId, fileLabels]) => {
                const fileName = fileLabels[0]?.fileName ?? "unknown";
                return (
                  <FileGroup
                    key={projectFileId}
                    fileName={fileName}
                    projectFileId={projectFileId}
                    labels={fileLabels}
                    activeLabelId={activeLabelId}
                    onLabelSelect={onSelect}
                    onCreateLabel={onCreateLabel}
                    isCreatingLabel={isCreatingLabel}
                  />
                );
              }
            )}
          </div>
        )}
      </div>
    </div>
  );
}
