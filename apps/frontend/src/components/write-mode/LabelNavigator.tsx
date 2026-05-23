/**
 * LabelNavigator Component
 *
 * Left sidebar for navigating labels in WriteMode.
 * Groups labels by source file name with visual status indicators.
 * Supports inline label creation, context menu, inline rename,
 * metadata editing, and soft delete.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { PublicLabel, LabelStatus } from "@branchforge/shared";
import {
  ArrowUpDown,
  Clock,
  Sparkles,
  ChevronLeft,
  File,
  FolderOpen,
  Plus,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { LabelContextMenu } from "@/components/write-mode/LabelContextMenu";
import { LabelEditDialog } from "@/components/write-mode/LabelEditDialog";
import { VariablesModal } from "@/components/ide-shared/VariablesModal";
import { StatsDialog } from "@/components/StatsDialog";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStats } from "@/hooks/useStats";
import { useVariables } from "@/hooks/useVariables";
import type { UpdateLabelInput } from "@/lib/api/labels";

const STATUS_COLORS: Record<LabelStatus, string> = {
  FINAL: "var(--theme-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
};

// ============================================================================
// Inline Rename Input Component
// ============================================================================

interface InlineRenameInputProps {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

function InlineRenameInput({
  initialValue,
  onSave,
  onCancel,
  isSaving,
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      onCancel();
      return;
    }
    try {
      await onSave(trimmed);
      onCancel();
    } catch {
      // Save failed — leave the inline input open so the user can correct
      // or try again. The caller (e.g. mutation hook) should surface the
      // error through its own mechanism (toast / inline error state).
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
    <div className="flex items-center gap-1.5 min-w-0 px-3 py-2.5">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => handleSubmit()}
        className="flex-1 min-w-0 px-2 py-0.5 border rounded text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30"
        disabled={isSaving}
        maxLength={255}
      />
      {isSaving && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

// ============================================================================
// Label Item Component
// ============================================================================

interface LabelItemProps {
  label: PublicLabel;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent, label: PublicLabel) => void;
  onDoubleClick: (label: PublicLabel) => void;
  isRenaming: boolean;
  onRenameSave: (value: string) => Promise<void>;
  onRenameCancel: () => void;
  isSavingRename: boolean;
}

function LabelItem({
  label,
  isActive,
  onSelect,
  onContextMenu,
  onDoubleClick,
  isRenaming,
  onRenameSave,
  onRenameCancel,
  isSavingRename,
}: LabelItemProps) {
  const statusColor = STATUS_COLORS[label.status ?? "DRAFT"];

  if (isRenaming) {
    return (
      <div
        className={`
          w-full rounded-md border transition-all
          ${
            isActive
              ? "bg-[var(--theme-color)]/10 border-[var(--theme-color)] shadow-sm"
              : "bg-card/50 border-border"
          }
        `}
      >
        <InlineRenameInput
          key={label.id}
          initialValue={label.title}
          onSave={onRenameSave}
          onCancel={onRenameCancel}
          isSaving={isSavingRename}
        />
      </div>
    );
  }

  const tooltipContent = label.labelName
    ? `${label.title} (${label.labelName})`
    : label.title;

  return (
    <Tooltip content={tooltipContent}>
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => onContextMenu(e, label)}
        onDoubleClick={() => onDoubleClick(label)}
        aria-pressed={isActive}
        className={`
        relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md border transition-all
        ${
          isActive
            ? "bg-[var(--theme-color)]/10 border-[var(--theme-color)] shadow-sm"
            : "bg-card/80 border-transparent hover:border-border hover:bg-accent/50"
        }
      `}
      >
        {/* Status dot on the left */}
        <div
          className="size-2 rounded-full flex-shrink-0 ring-2 ring-background"
          style={{
            backgroundColor: statusColor,
          }}
          title={`Status: ${label.status ?? "DRAFT"}`}
        />

        {/* Label Title */}
        <div className="flex-1 min-w-0 text-left">
          <h3
            className={`text-sm font-medium truncate ${
              isActive ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {label.title}
          </h3>
        </div>
      </button>
    </Tooltip>
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
  onLabelContextMenu: (e: React.MouseEvent, label: PublicLabel) => void;
  onLabelDoubleClick: (label: PublicLabel) => void;
  renamingLabelId: string | null;
  onRenameSave: (labelId: string, value: string) => Promise<void>;
  onRenameCancel: () => void;
  isSavingRename: boolean;
}

function FileGroup({
  fileName,
  projectFileId: fileGroupId,
  labels,
  activeLabelId,
  onLabelSelect,
  onCreateLabel,
  isCreatingLabel,
  onLabelContextMenu,
  onLabelDoubleClick,
  renamingLabelId,
  onRenameSave,
  onRenameCancel,
  isSavingRename,
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
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/20 border border-border/40">
        <File className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {fileName}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
          {labels.length}
        </span>
      </div>

      {/* Label list */}
      <div className="space-y-2.5">
        {labels.map((label) => (
          <LabelItem
            key={label.id}
            label={label}
            isActive={activeLabelId === label.id}
            onSelect={() => onLabelSelect(label.id)}
            onContextMenu={onLabelContextMenu}
            onDoubleClick={onLabelDoubleClick}
            isRenaming={renamingLabelId === label.id}
            onRenameSave={(value) => onRenameSave(label.id, value)}
            onRenameCancel={onRenameCancel}
            isSavingRename={isSavingRename}
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

// ============================================================================
// Label Navigator Component
// ============================================================================

interface RouteConfigOption {
  id: string;
  routeKey: string;
  routeName: string;
}

interface LabelNavigatorProps {
  labels: PublicLabel[];
  activeLabelId: string | null;
  onSelect: (labelId: string) => void;
  projectId: string;
  projectName?: string;
  projectLabelCount?: number;
  onToggleCollapse?: () => void;
  // Create
  onCreateLabel?: (data: {
    title: string;
    projectFileId: string;
  }) => Promise<unknown>;
  isCreatingLabel?: boolean;
  // Update
  onUpdateLabel?: (
    labelId: string,
    data: UpdateLabelInput
  ) => Promise<PublicLabel>;
  isUpdatingLabel?: boolean;
  // Delete
  onDeleteLabel?: (labelId: string) => Promise<void>;
  isDeletingLabel?: boolean;
  // Route configs for edit dialog
  routeConfigs?: RouteConfigOption[];
}

export function LabelNavigator({
  labels,
  activeLabelId,
  onSelect,
  projectId,
  projectName,
  projectLabelCount,
  onToggleCollapse,
  onCreateLabel,
  isCreatingLabel,
  onUpdateLabel,
  isUpdatingLabel,
  onDeleteLabel,
  isDeletingLabel,
  routeConfigs,
}: LabelNavigatorProps) {
  // Prerequisites data hooks
  const { stats } = useStats(projectId);
  const { variables } = useVariables(projectId);

  // Prerequisites management modals
  const [stateVariablesModalOpen, setStateVariablesModalOpen] = useState(false);
  const [metersModalOpen, setMetersModalOpen] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    label: PublicLabel | null;
  }>({ open: false, x: 0, y: 0, label: null });

  // Inline rename state
  const [renamingLabelId, setRenamingLabelId] = useState<string | null>(null);

  // Edit dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    label: PublicLabel | null;
  }>({ open: false, label: null });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    label: PublicLabel | null;
  }>({ open: false, label: null });

  // Search/filter state (local, instant, no debouncing)
  const [searchQuery, setSearchQuery] = useState("");

  // Sort mode: "sequence" (default, by sequenceOrder) or "lastUpdated"
  const [sortMode, setSortMode] = useState<"sequence" | "lastUpdated">(
    "sequence"
  );

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, label: PublicLabel) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ open: true, x: e.clientX, y: e.clientY, label });
    },
    []
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, []);

  // Inline rename handlers
  const handleDoubleClick = useCallback((label: PublicLabel) => {
    setRenamingLabelId(label.id);
  }, []);

  const handleRenameSave = useCallback(
    async (labelId: string, value: string) => {
      await onUpdateLabel?.(labelId, { title: value });
      setRenamingLabelId(null);
    },
    [onUpdateLabel]
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingLabelId(null);
  }, []);

  // Context menu actions
  const handleContextRename = useCallback(() => {
    if (contextMenu.label) {
      setRenamingLabelId(contextMenu.label.id);
    }
  }, [contextMenu.label]);

  const handleContextEditDetails = useCallback(() => {
    if (contextMenu.label) {
      setEditDialog({ open: true, label: contextMenu.label });
    }
  }, [contextMenu.label]);

  const handleContextDelete = useCallback(() => {
    if (contextMenu.label) {
      setDeleteConfirm({ open: true, label: contextMenu.label });
    }
  }, [contextMenu.label]);

  // Edit dialog save handler
  const handleEditSave = useCallback(
    async (data: {
      title?: string;
      labelName?: string;
      route?: string | null;
      status?: "DRAFT" | "REVIEW" | "FINAL";
      visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      prerequisites?: {
        meters?: Record<string, number>;
        stateVariables?: string[];
      } | null;
    }) => {
      if (editDialog.label) {
        await onUpdateLabel?.(editDialog.label.id, data);
        setEditDialog({ open: false, label: null });
      }
    },
    [editDialog.label, onUpdateLabel]
  );

  // Delete confirmation handler
  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.label) {
      await onDeleteLabel?.(deleteConfirm.label.id);
      setDeleteConfirm({ open: false, label: null });
    }
  }, [deleteConfirm.label, onDeleteLabel]);

  // Portal target — render dialogs at body level to escape
  // the sidebar's CSS transform containing block
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return labels;
    const query = searchQuery.toLowerCase().trim();
    return labels.filter(
      (label) =>
        label.title.toLowerCase().includes(query) ||
        label.labelName?.toLowerCase().includes(query)
    );
  }, [labels, searchQuery]);

  const compareByUpdatedAt = (a: PublicLabel, b: PublicLabel): number => {
    const timeDiff =
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.labelNumber - a.labelNumber;
  };

  const groupedLabels = useMemo(() => {
    // Short-circuit: "lastUpdated" mode only needs the flat list
    if (sortMode === "lastUpdated") {
      const flat = filteredLabels.toSorted(compareByUpdatedAt);
      return { map: new Map<string, PublicLabel[]>(), flat, mode: sortMode };
    }

    const groups = new Map<string, PublicLabel[]>();

    for (const label of filteredLabels) {
      const key = label.projectFileId;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(label);
    }

    const groupEntries = Array.from(groups.entries());
    groupEntries.sort(([, aLabels], [, bLabels]) => {
      const aName = aLabels[0]?.fileName ?? "";
      const bName = bLabels[0]?.fileName ?? "";
      return aName.localeCompare(bName);
    });

    const sorted = new Map<string, PublicLabel[]>();
    for (const [key, groupLabels] of groupEntries) {
      sorted.set(
        key,
        groupLabels.toSorted((a, b) => a.sequenceOrder - b.sequenceOrder)
      );
    }

    return { map: sorted, flat: null, mode: sortMode };
  }, [filteredLabels, sortMode]);

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

        {/* Search input + sort toggle */}
        <div className="mt-2.5 flex items-center gap-1">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter..."
              className="w-full pl-7 pr-7 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/80 transition-colors"
                aria-label="Clear search"
              >
                <X className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <Tooltip
            content={
              sortMode === "lastUpdated"
                ? "Sorted by last updated (click for file order)"
                : "Sorted by file order (click for recent)"
            }
          >
            <button
              type="button"
              onClick={() =>
                setSortMode((prev) =>
                  prev === "lastUpdated" ? "sequence" : "lastUpdated"
                )
              }
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label={`Sort mode: ${sortMode === "lastUpdated" ? "last updated" : "sequence order"}. Click to toggle.`}
            >
              {sortMode === "lastUpdated" ? (
                <Clock className="size-3.5" />
              ) : (
                <ArrowUpDown className="size-3.5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Label List */}
      <div className="p-3 space-y-2">
        {groupedLabels.flat && groupedLabels.flat.length > 0 ? (
          // Flat list for "last updated" sort — no file grouping
          <div className="space-y-2.5" key={sortMode}>
            {groupedLabels.flat.map((label) => (
              <LabelItem
                key={label.id}
                label={label}
                isActive={activeLabelId === label.id}
                onSelect={() => onSelect(label.id)}
                onContextMenu={handleContextMenu}
                onDoubleClick={handleDoubleClick}
                isRenaming={renamingLabelId === label.id}
                onRenameSave={(value) => handleRenameSave(label.id, value)}
                onRenameCancel={handleRenameCancel}
                isSavingRename={isUpdatingLabel ?? false}
              />
            ))}
          </div>
        ) : groupedLabels.map.size === 0 ? (
          labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="size-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No labels found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Import a .rpy file or create labels to get started.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="size-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No labels match "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs text-[var(--theme-color)] hover:underline mt-2"
              >
                Clear search
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3" key={sortMode}>
            {Array.from(groupedLabels.map.entries()).map(
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
                    onLabelContextMenu={handleContextMenu}
                    onLabelDoubleClick={handleDoubleClick}
                    renamingLabelId={renamingLabelId}
                    onRenameSave={handleRenameSave}
                    onRenameCancel={handleRenameCancel}
                    isSavingRename={isUpdatingLabel ?? false}
                  />
                );
              }
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      <LabelContextMenu
        open={contextMenu.open}
        onClose={handleContextMenuClose}
        x={contextMenu.x}
        y={contextMenu.y}
        onRename={handleContextRename}
        onEditDetails={handleContextEditDetails}
        onDelete={handleContextDelete}
      />

      {/* Edit Details Dialog — portaled to body to escape sidebar transform */}
      {portalTarget &&
        createPortal(
          editDialog.label && (
            <LabelEditDialog
              open={editDialog.open}
              onOpenChange={(open) =>
                setEditDialog((prev) => ({ ...prev, open }))
              }
              currentTitle={editDialog.label.title}
              currentLabelName={editDialog.label.labelName}
              currentRoute={editDialog.label.routeKey}
              currentStatus={editDialog.label.status}
              currentVisibility={editDialog.label.visibility}
              currentPrerequisites={
                editDialog.label.conditions
                  ? {
                      meters: editDialog.label.conditions.stats,
                      stateVariables: editDialog.label.conditions.variables,
                    }
                  : null
              }
              routeConfigs={routeConfigs ?? []}
              meters={stats}
              variables={variables}
              onSave={handleEditSave}
              isSaving={isUpdatingLabel ?? false}
              onOpenStateVariables={() => setStateVariablesModalOpen(true)}
              onOpenStats={() => setMetersModalOpen(true)}
            />
          ),
          portalTarget
        )}

      {/* Delete Confirmation Dialog — portaled to body to escape sidebar transform */}
      {portalTarget &&
        createPortal(
          <ConfirmDialog
            open={deleteConfirm.open}
            onOpenChange={(open) =>
              setDeleteConfirm((prev) => ({ ...prev, open }))
            }
            onConfirm={handleDeleteConfirm}
            title="Delete Label"
            description={`Are you sure you want to delete "${deleteConfirm.label?.title ?? "this label"}"? This will remove the label and its content from the file. This action cannot be undone.`}
            confirmLabel="Delete"
            isLoading={isDeletingLabel ?? false}
            loadingLabel="Deleting..."
          />,
          portalTarget
        )}

      {/* State Variables Management Modal */}
      {portalTarget &&
        createPortal(
          <VariablesModal
            open={stateVariablesModalOpen}
            onOpenChange={setStateVariablesModalOpen}
            projectId={projectId}
          />,
          portalTarget
        )}

      {/* Stats Management Modal */}
      {portalTarget &&
        createPortal(
          <StatsDialog
            open={metersModalOpen}
            onOpenChange={setMetersModalOpen}
            projectId={projectId}
          />,
          portalTarget
        )}
    </div>
  );
}
