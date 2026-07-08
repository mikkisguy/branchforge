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
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { LabelEditDialog } from "@/components/write-mode/LabelEditDialog.lazy";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CharacterEditDialog } from "@/components/CharacterEditDialog.lazy";
import { ChevronRight, ChevronLeft, FileText, Loader2 } from "lucide-react";
import { EditorTabBar } from "@/components/ide-shared";
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
import type { DialogueEntry } from "@/lib/prose-types";
import type { PublicLabel } from "@branchforge/shared";

const sidebarVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      variant: {
        collapsed:
          "w-0 opacity-0 -translate-x-full pointer-events-none max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:mt-0 max-md:rounded-none",
        expanded:
          "w-48 opacity-100 translate-x-0 max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0 max-md:bg-card",
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

  const editorRef = useRef<{ focus: () => void } | null>(null);

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
        <div className="fixed top-2 right-2 z-[100] pointer-events-auto">
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
            <div
              className="hidden max-md:block max-md:fixed max-md:inset-0 max-md:bg-black/40 max-md:z-30"
              onClick={() => {
                if (!isLeftSidebarCollapsed) setIsLeftSidebarCollapsed(true);
                if (!isRightSidebarCollapsed) setIsRightSidebarCollapsed(true);
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
              <div className="h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
      </div>
    </div>
  );
}
