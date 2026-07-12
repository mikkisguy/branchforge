/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ProseEditor,
  LabelNavigator,
  LabelPropertiesPanel,
} from "@/components/write-mode";
import type { ProseEditorRef } from "@/components/write-mode";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { LabelEditDialog } from "@/components/write-mode/LabelEditDialog.lazy";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CharacterEditDialog } from "@/components/CharacterEditDialog.lazy";
import {
  ChevronRight,
  ChevronLeft,
  FileText,
  Loader2,
  PanelTop,
  Eye,
  EyeOff,
  Type,
  Pilcrow,
  BarChart3,
} from "lucide-react";
import {
  EditorTabBar,
  MobileOverflowFAB,
  useFABPopover,
  FABToggle,
  FABExpandableChoice,
  FABUndoButton,
  FABRedoButton,
  FABFocusButton,
} from "@/components/ide-shared";
import { Button } from "@/components/ui/button";
import { useLabels } from "@/hooks/useLabels";
import { useCharacters } from "@/hooks/useCharacters";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { useProject } from "@/hooks/useProject";
import { useToast } from "@/contexts/ToastContext";
import { cva } from "class-variance-authority";
import { useResponsiveSidebarState } from "@/hooks/useResponsiveSidebarState";
import { useStats } from "@/hooks/useStats";
import { usePairGroups } from "@/hooks/usePairGroups";
import {
  useWriteAutosave,
  getPersistedDialogueFromLabel,
  type LabelDialogueDraft,
} from "@/hooks/useWriteAutosave";
import { useWriteTabs } from "@/hooks/useWriteTabs";
import { useLabelSwitcher } from "@/hooks/useLabelSwitcher";
import { useWriteFocusMode } from "@/hooks/useWriteFocusMode";
import {
  useLocalStorage,
  useLocalStorageBoolean,
  useLocalStorageNumber,
} from "@/hooks/useLocalStorage";
import type { DialogueEntry } from "@/lib/prose-types";
import type { PublicLabel } from "@branchforge/shared";

function WritingGoalFABRow({
  todayWordCount,
  dailyGoal,
  onOpenStats,
}: {
  todayWordCount: number;
  dailyGoal: number;
  onOpenStats: () => void;
}) {
  const { closePopover } = useFABPopover();
  const pct =
    dailyGoal > 0
      ? Math.min(100, Math.round((todayWordCount / dailyGoal) * 100))
      : 0;
  return (
    <button
      type="button"
      onClick={() => {
        onOpenStats();
        closePopover();
      }}
      className="flex flex-col w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
    >
      <span className="flex items-center gap-3 w-full">
        <BarChart3 className="size-4 shrink-0" />
        <span className="flex-1">Writing Goal</span>
        <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
      </span>
      <span className="pl-7 text-xs text-muted-foreground mt-0.5">
        {todayWordCount.toLocaleString()} / {dailyGoal.toLocaleString()} words
      </span>
    </button>
  );
}

const sidebarVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      variant: {
        collapsed:
          "w-0 opacity-0 -translate-x-full pointer-events-none max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:mt-0 max-md:rounded-none",
        expanded:
          "w-60 opacity-100 translate-x-0 max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0 max-md:bg-card",
      },
    },
    defaultVariants: {
      variant: "expanded",
    },
  }
);

interface WriteModeProps {
  projectName?: string;
  onOpenSettings?: () => void;
}

export function WriteMode({ projectName, onOpenSettings }: WriteModeProps) {
  const { currentProject } = useProject();
  const { error: showErrorToast } = useToast();
  const {
    labels,
    activeLabel,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
    updateDialogue,
    isUpdatingDialogue,
    createLabel,
    isCreatingLabel,
    updateLabel,
    isUpdatingLabel,
    deleteLabel,
    isDeletingLabel,
  } = useLabels();

  const { characters } = useCharacters(currentProject?.id ?? "");
  const { routeConfigs } = useRouteConfigs(currentProject?.id ?? "");
  const { stats } = useStats(currentProject?.id ?? "");
  const { pairGroups } = usePairGroups(currentProject?.id ?? "", {
    enabled: !!currentProject?.id,
  });

  // Shared memoized projection reused by both LabelPropertiesPanel and
  // LabelEditDialog to avoid redundant allocations and broken memoization.
  const pairGroupSummaries = useMemo(
    () =>
      pairGroups.map((pg) => ({
        id: pg.id,
        characterAName: pg.characterAName,
        characterBName: pg.characterBName,
        duoEndingLabel: pg.duoEndingLabel,
      })),
    [pairGroups]
  );

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed, isMobile] =
    useResponsiveSidebarState("write:left-sidebar-collapsed");
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] =
    useResponsiveSidebarState("write:right-sidebar-collapsed");

  // Lifted dialog state (from LabelNavigator)
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    label: PublicLabel | null;
  }>({ open: false, label: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    label: PublicLabel | null;
  }>({ open: false, label: null });

  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );

  const editorRef = useRef<ProseEditorRef | null>(null);

  const [proseUndoState, setProseUndoState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const [wordCountState, setWordCountState] = useState<{
    todayWordCount: number;
    dailyGoal: number;
  }>({ todayWordCount: 0, dailyGoal: 0 });

  const { isFocusMode, focusToggleRef, handleFocusModeToggle } =
    useWriteFocusMode({
      isLeftSidebarCollapsed,
      setIsLeftSidebarCollapsed,
      isRightSidebarCollapsed,
      setIsRightSidebarCollapsed,
      editorRef,
    });

  // On mobile, only one overlay sidebar may be open at a time. Opening one
  // closes the other so the two panels never stack on a narrow viewport.
  const openLeftSidebar = useCallback(() => {
    setIsLeftSidebarCollapsed(false);
    if (isMobile) setIsRightSidebarCollapsed(true);
  }, [isMobile, setIsLeftSidebarCollapsed, setIsRightSidebarCollapsed]);

  const toggleRightSidebar = useCallback(() => {
    setIsRightSidebarCollapsed((prev) => !prev);
    if (isMobile) setIsLeftSidebarCollapsed(true);
  }, [isMobile, setIsLeftSidebarCollapsed, setIsRightSidebarCollapsed]);

  const [currentDraft, setCurrentDraft] = useState<LabelDialogueDraft>(() => ({
    labelId: activeLabel?.id ?? activeLabelId,
    entries: getPersistedDialogueFromLabel(activeLabel),
  }));

  const prevDraftLabelIdRef = useRef<string | null>(null);
  const isSwitchingLabelsRef = useRef(false);
  const pendingResetHashRef = useRef<LabelDialogueDraft | null>(null);

  const {
    saveStatus,
    isDirty,
    triggerSave,
    resetSavedHash,
    lastSaved,
    conflictByLabel,
  } = useWriteAutosave({
    projectId: currentProject?.id,
    draft: currentDraft,
    labels,
    activeLabel,
    isUpdatingDialogue,
    skipSaveRef: isSwitchingLabelsRef,
    onUpdateDialogue: updateDialogue,
    showErrorToast,
  });

  const { tabItems, selectLabelTab, handleCloseTab } = useWriteTabs({
    projectId: currentProject?.id,
    labels,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
  });

  const { handleSelectLabel } = useLabelSwitcher({
    activeLabelId,
    isDirty,
    triggerSave,
    onSwitch: selectLabelTab,
    showErrorToast,
  });

  useEffect(() => {
    const prevLabelId = prevDraftLabelIdRef.current;

    if (activeLabel && activeLabel.id !== prevLabelId) {
      const persistedDialogue = getPersistedDialogueFromLabel(activeLabel);
      const nextDraft: LabelDialogueDraft = {
        labelId: activeLabel.id,
        entries: persistedDialogue,
      };

      isSwitchingLabelsRef.current = true;
      pendingResetHashRef.current = nextDraft;
      setCurrentDraft(nextDraft);
      prevDraftLabelIdRef.current = activeLabel.id;
      return;
    }

    if (!activeLabelId) {
      prevDraftLabelIdRef.current = null;
    }
  }, [activeLabel, activeLabelId]);

  useEffect(() => {
    if (!pendingResetHashRef.current) {
      return;
    }

    resetSavedHash(pendingResetHashRef.current);
    pendingResetHashRef.current = null;
    isSwitchingLabelsRef.current = false;
  }, [currentDraft, resetSavedHash]);

  // ── Editor font/family/layout/badge settings ─────────────────────────

  const WRITE_FONT_SIZE_OPTIONS = useMemo(
    () =>
      [
        { label: "Small", value: 14 },
        { label: "Medium", value: 16 },
        { label: "Large", value: 18 },
        { label: "Extra Large", value: 20 },
        { label: "Huge", value: 22 },
      ] as const,
    []
  );

  const [writeFontSize, setWriteFontSize] = useLocalStorageNumber(
    "write:font-size",
    16,
    {
      validate: (v) => WRITE_FONT_SIZE_OPTIONS.some((o) => o.value === v),
    }
  );

  // Apply CSS variable when font size changes (mirrors FontSizeSwitcher)
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--prose-editor-font-size",
      `${writeFontSize}px`
    );
  }, [writeFontSize]);

  const FONT_FAMILY_OPTIONS = useMemo(
    () =>
      [
        { label: "Default", value: "default" },
        { label: "Fira Code", value: "fira-code" },
        { label: "Noto Serif", value: "noto-serif" },
      ] as const,
    []
  );

  const [writeFontFamily, setWriteFontFamily] = useLocalStorage<string>(
    "write:font-family",
    "default",
    {
      validate: (v) => FONT_FAMILY_OPTIONS.some((o) => o.value === v),
    }
  );

  // Apply CSS variable when font family changes (mirrors FontFamilySwitcher)
  useEffect(() => {
    const option =
      FONT_FAMILY_OPTIONS.find((o) => o.value === writeFontFamily) ??
      FONT_FAMILY_OPTIONS[0];
    const families: Record<string, string> = {
      default: "var(--font-sans)",
      "fira-code": "'Fira Code', monospace",
      "noto-serif": "'Noto Serif', serif",
    };
    document.documentElement.style.setProperty(
      "--prose-editor-font-family",
      families[option.value] ?? families["default"]
    );
  }, [writeFontFamily, FONT_FAMILY_OPTIONS]);

  const [writeLineLayout, setWriteLineLayout] = useLocalStorage<string>(
    "write:line-layout",
    "inline",
    { validate: (v) => v === "inline" || v === "stacked" }
  );
  const [showBadges, setShowBadges] = useLocalStorageBoolean(
    "write:show-badges",
    true
  );

  // ──────────────────────────────────────────────────────────────────────

  const handleContentChange = useCallback((entries: DialogueEntry[]) => {
    setCurrentDraft((prev) => ({ ...prev, entries }));
  }, []);

  const handleLabelSelect = useCallback(
    (labelId: string) => {
      void handleSelectLabel(labelId);
    },
    [handleSelectLabel]
  );

  const handleEditSave = useCallback(
    async (data: {
      title?: string;
      labelName?: string;
      route?: string | null;
      status?: "DRAFT" | "REVIEW" | "FINAL";
      visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      duoPairId?: string | null;
    }) => {
      if (editDialog.label) {
        await updateLabel(editDialog.label.id, data);
        setEditDialog({ open: false, label: null });
      }
    },
    [editDialog.label, updateLabel]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.label) {
      await deleteLabel(deleteConfirm.label.id);
      setDeleteConfirm({ open: false, label: null });
    }
  }, [deleteConfirm.label, deleteLabel]);

  const handleEditLabel = useCallback((label: PublicLabel) => {
    setEditDialog({ open: true, label });
  }, []);

  const handleDeleteRequest = useCallback((label: PublicLabel) => {
    setDeleteConfirm({ open: true, label });
  }, []);

  const handleEditFromPanel = useCallback(() => {
    if (activeLabel) {
      setEditDialog({ open: true, label: activeLabel });
    }
  }, [activeLabel]);

  const editorSaveProps = useMemo(
    () => ({
      isSaving: saveStatus === "saving",
      lastSaved: saveStatus === "saved" ? lastSaved : null,
      saveError: saveStatus === "error",
    }),
    [lastSaved, saveStatus]
  );

  const hasConflict = activeLabelId
    ? conflictByLabel.get(activeLabelId)
    : false;

  if (!currentProject) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileText className="size-10 text-muted-foreground/60" />
        </div>
        <p className="text-foreground font-medium">No project selected</p>
        <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
          To start writing, import a project in Settings.
        </p>
        {onOpenSettings && (
          <Button type="button" className="mt-4" onClick={onOpenSettings}>
            Open Settings
          </Button>
        )}
      </div>
    );
  }

  if (isLoadingLabels) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="relative">
          <div className="size-16 rounded-full bg-[var(--theme-color)]/10 flex items-center justify-center">
            <Loader2 className="size-8 text-[var(--theme-color)] animate-spin" />
          </div>
          <div className="absolute inset-0 size-16 rounded-full bg-[var(--theme-color)]/5 animate-ping" />
        </div>
        <p className="text-muted-foreground mt-4">Loading labels…</p>
      </div>
    );
  }

  if (!labels.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileText className="size-10 text-muted-foreground/60" />
        </div>
        <p className="text-foreground font-medium">No labels in this project</p>
        <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
          Import content or create labels to start writing.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden max-md:px-2">
      {isFocusMode && (
        <div className="fixed top-2 right-2 z-[100] pointer-events-auto max-md:hidden">
          <FocusModeToggle
            ref={focusToggleRef}
            isFocusMode={isFocusMode}
            onToggle={handleFocusModeToggle}
          />
        </div>
      )}

      <div className="flex-1 flex gap-4 px-4 max-md:px-0 pb-0 overflow-hidden min-h-0 min-w-0 relative">
        {/* Mobile scrim backdrop – collapses open overlays on tap */}
        {!isFocusMode &&
          (!isLeftSidebarCollapsed || !isRightSidebarCollapsed) && (
            <button
              type="button"
              className="hidden max-md:block max-md:fixed max-md:inset-0 max-md:bg-black/40 max-md:z-30 border-0 p-0 cursor-pointer"
              aria-label="Close overlays"
              onClick={() => {
                if (!isLeftSidebarCollapsed) setIsLeftSidebarCollapsed(true);
                if (!isRightSidebarCollapsed) setIsRightSidebarCollapsed(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!isLeftSidebarCollapsed) setIsLeftSidebarCollapsed(true);
                  if (!isRightSidebarCollapsed)
                    setIsRightSidebarCollapsed(true);
                }
              }}
            />
          )}
        <div
          aria-hidden={isFocusMode}
          className={sidebarVariants({
            variant:
              isFocusMode || isLeftSidebarCollapsed ? "collapsed" : "expanded",
          })}
        >
          <div className="h-full overflow-y-auto relative">
            <LabelNavigator
              labels={labels}
              activeLabelId={activeLabelId}
              onSelect={handleLabelSelect}
              projectName={projectName || currentProject?.name}
              projectLabelCount={labels.length}
              onToggleCollapse={() => setIsLeftSidebarCollapsed(true)}
              onCreateLabel={async (data) => {
                await createLabel({
                  projectId: currentProject!.id,
                  ...data,
                });
              }}
              isCreatingLabel={isCreatingLabel}
              onUpdateLabel={async (labelId, data) => {
                return updateLabel(labelId, data);
              }}
              isUpdatingLabel={isUpdatingLabel}
              onEditLabel={handleEditLabel}
              onDeleteRequest={handleDeleteRequest}
            />
          </div>
        </div>

        {isLeftSidebarCollapsed && !isFocusMode && (
          <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4 max-md:hidden">
            <button
              type="button"
              onClick={openLeftSidebar}
              className="size-12 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors flex items-center justify-center"
              aria-label="Expand label navigator sidebar"
              title="Expand label navigator sidebar"
            >
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0 mt-3">
          {!isFocusMode && (
            <div className="mb-2 flex gap-2 items-center">
              {isLeftSidebarCollapsed && (
                <button
                  type="button"
                  onClick={openLeftSidebar}
                  className="md:hidden h-12 w-9 shrink-0 rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm flex items-center justify-center"
                  aria-label="Expand label navigator sidebar"
                  title="Expand label navigator sidebar"
                >
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              )}
              <div className="flex-1 min-w-0 h-12 overflow-hidden">
                <EditorTabBar
                  items={tabItems}
                  activeItemId={activeLabelId}
                  onSelect={handleLabelSelect}
                  onClose={handleCloseTab}
                  idPrefix="tab-"
                  titleMaxWidthClassName="max-w-[180px]"
                />
              </div>
              <div className="h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] max-md:hidden">
                <div className="h-full flex items-center justify-end px-3">
                  <FocusModeToggle
                    ref={focusToggleRef}
                    isFocusMode={isFocusMode}
                    onToggle={handleFocusModeToggle}
                  />
                </div>
              </div>
              {isRightSidebarCollapsed && (
                <button
                  type="button"
                  onClick={toggleRightSidebar}
                  className="md:hidden h-12 w-9 shrink-0 rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm flex items-center justify-center"
                  aria-label="Expand properties sidebar"
                  title="Expand properties sidebar"
                >
                  <ChevronLeft className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          <div className="flex-1 flex justify-center min-h-0 min-w-0">
            <div className="w-full max-w-3xl min-h-0">
              <ProseEditor
                ref={editorRef}
                activeLabel={activeLabel}
                characters={characters}
                onChange={handleContentChange}
                isFocusMode={isFocusMode}
                isSaving={editorSaveProps.isSaving}
                lastSaved={editorSaveProps.lastSaved}
                saveError={editorSaveProps.saveError}
                saveConflict={Boolean(hasConflict)}
                onUndoStateChange={setProseUndoState}
                onWordCountChange={setWordCountState}
                showBadges={showBadges}
                onShowBadgesChange={setShowBadges}
                layoutMode={writeLineLayout as "inline" | "stacked"}
                onLayoutModeChange={setWriteLineLayout}
                fontSizeValue={writeFontSize}
                onFontSizeChange={setWriteFontSize}
                fontFamilyValue={writeFontFamily}
                onFontFamilyChange={setWriteFontFamily}
              />
            </div>
          </div>
        </div>

        <LabelPropertiesPanel
          activeLabel={activeLabel}
          characters={characters}
          stats={stats}
          routeConfigs={routeConfigs}
          pairGroups={pairGroupSummaries}
          isCollapsed={isRightSidebarCollapsed || isFocusMode}
          onCollapseToggle={!isFocusMode ? toggleRightSidebar : undefined}
          onEdit={handleEditFromPanel}
          onCharacterEdit={setEditingCharacterId}
        />

        {/* Lifted Dialogs — portaled to body */}
        {/* Edit Details Dialog */}
        {typeof window !== "undefined" &&
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
                routeConfigs={routeConfigs.map((rc) => ({
                  id: rc.id,
                  routeKey: rc.routeKey,
                  routeName: rc.routeName,
                }))}
                pairGroups={pairGroupSummaries}
                currentDuoPairId={editDialog.label.duoPairId ?? null}
                duoEndingEnabled={currentProject?.duoEndingEnabled ?? false}
                onSave={handleEditSave}
                isSaving={isUpdatingLabel}
              />
            ),
            document.body
          )}

        {/* Delete Confirmation Dialog */}
        {typeof window !== "undefined" &&
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
              isLoading={isDeletingLabel}
              loadingLabel="Deleting..."
            />,
            document.body
          )}

        {/* Character Edit Dialog */}
        {typeof window !== "undefined" &&
          createPortal(
            <CharacterEditDialog
              open={editingCharacterId !== null}
              onOpenChange={(open) => {
                if (!open) setEditingCharacterId(null);
              }}
              projectId={currentProject.id}
              characterId={editingCharacterId ?? undefined}
            />,
            document.body
          )}
        {/* Mobile FAB — settings at top, actions closest to thumb */}
        <MobileOverflowFAB aria-label="Editor actions">
          <FABExpandableChoice
            icon={<Type className="size-4" />}
            label="Font Size"
            currentLabel={
              WRITE_FONT_SIZE_OPTIONS.find((o) => o.value === writeFontSize)
                ?.label ?? "Medium"
            }
            options={WRITE_FONT_SIZE_OPTIONS.map((o) => ({
              label: o.label,
              value: o.value,
              active: o.value === writeFontSize,
            }))}
            onSelect={(v) => setWriteFontSize(v as number)}
          />
          <FABExpandableChoice
            icon={<Pilcrow className="size-4" />}
            label="Font Family"
            currentLabel={
              FONT_FAMILY_OPTIONS.find((o) => o.value === writeFontFamily)
                ?.label ?? "Default"
            }
            options={FONT_FAMILY_OPTIONS.map((o) => ({
              label: o.label,
              value: o.value,
              active: o.value === writeFontFamily,
            }))}
            onSelect={(v) => setWriteFontFamily(v as string)}
          />
          <FABToggle
            icon={<PanelTop className="size-4" />}
            label="Line Layout: Stacked"
            active={writeLineLayout === "stacked"}
            onClick={() =>
              setWriteLineLayout(
                writeLineLayout === "stacked" ? "inline" : "stacked"
              )
            }
          />
          <FABToggle
            icon={
              showBadges ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )
            }
            label="Show Badges"
            active={showBadges}
            onClick={() => setShowBadges((v) => !v)}
          />
          <div className="h-px bg-border/30 my-1" />
          {wordCountState.dailyGoal > 0 && (
            <WritingGoalFABRow
              todayWordCount={wordCountState.todayWordCount}
              dailyGoal={wordCountState.dailyGoal}
              onOpenStats={() => editorRef.current?.openWritingStats()}
            />
          )}
          {wordCountState.dailyGoal > 0 && (
            <div className="h-px bg-border/30 my-1" />
          )}
          <FABFocusButton
            isFocusMode={isFocusMode}
            onToggle={handleFocusModeToggle}
          />
          <FABUndoButton
            canUndo={proseUndoState.canUndo}
            onUndo={() => editorRef.current?.undo()}
          />
          <FABRedoButton
            canRedo={proseUndoState.canRedo}
            onRedo={() => editorRef.current?.redo()}
          />
        </MobileOverflowFAB>
      </div>
    </div>
  );
}
