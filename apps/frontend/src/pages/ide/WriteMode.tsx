/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Matches app design system with theme colors and simple styling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ProseEditor,
  LabelNavigator,
  CharacterReferencePanel,
} from "@/components/write-mode";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { EditorTabBar } from "@/components/ide-shared";
import { Button } from "@/components/ui/button";
import { useLabels } from "@/hooks/useLabels";
import { useCharacters } from "@/hooks/useCharacters";
import { useProject } from "@/hooks/useProject";
import { useToast } from "@/contexts/ToastContext";
import { cva } from "class-variance-authority";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorage";
import {
  useWriteAutosave,
  getPersistedDialogueFromLabel,
  type LabelDialogueDraft,
} from "@/hooks/useWriteAutosave";
import { useWriteTabs } from "@/hooks/useWriteTabs";
import { useLabelSwitcher } from "@/hooks/useLabelSwitcher";
import { useWriteFocusMode } from "@/hooks/useWriteFocusMode";
import type { DialogueEntry } from "@/lib/prose-types";

const sidebarVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      variant: {
        collapsed: "w-0 opacity-0 -translate-x-full pointer-events-none",
        expanded: "w-48 opacity-100 translate-x-0",
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
  } = useLabels();

  const { characters } = useCharacters(currentProject?.id ?? "");

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] =
    useLocalStorageBoolean("write:left-sidebar-collapsed", false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] =
    useLocalStorageBoolean("write:right-sidebar-collapsed", false);

  const editorRef = useRef<{ focus: () => void } | null>(null);

  const { isFocusMode, focusToggleRef, handleFocusModeToggle } =
    useWriteFocusMode({
      isLeftSidebarCollapsed,
      setIsLeftSidebarCollapsed,
      isRightSidebarCollapsed,
      setIsRightSidebarCollapsed,
      editorRef,
    });

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
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileText className="w-10 h-10 text-muted-foreground/60" />
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
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-[var(--theme-color)]/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[var(--theme-color)] animate-spin" />
          </div>
          <div className="absolute inset-0 w-16 h-16 rounded-full bg-[var(--theme-color)]/5 animate-ping" />
        </div>
        <p className="text-muted-foreground mt-4">Loading labels...</p>
      </div>
    );
  }

  if (!labels.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
          <FileText className="w-10 h-10 text-muted-foreground/60" />
        </div>
        <p className="text-foreground font-medium">No labels in this project</p>
        <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
          Import content or create labels to start writing.
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {isFocusMode && (
        <div className="fixed top-2 right-2 z-[100] pointer-events-auto">
          <FocusModeToggle
            ref={focusToggleRef}
            isFocusMode={isFocusMode}
            onToggle={handleFocusModeToggle}
          />
        </div>
      )}

      <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden min-h-0 min-w-0">
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
                  labelNumber: 1, // Backend will auto-assign
                  sequenceOrder: 0, // Backend will auto-assign
                });
              }}
              isCreatingLabel={isCreatingLabel}
            />
          </div>
        </div>

        {isLeftSidebarCollapsed && !isFocusMode && (
          <div className="min-h-0 shrink-0 mt-3 flex items-center -ml-4">
            <button
              type="button"
              onClick={() => setIsLeftSidebarCollapsed(false)}
              className="p-2 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors"
              aria-label="Expand label navigator sidebar"
              title="Expand label navigator sidebar"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0 mt-3">
          {!isFocusMode && (
            <div className="mb-2 flex gap-2">
              <div className="flex-1 min-w-0">
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

        <CharacterReferencePanel
          characters={characters}
          activeLabel={activeLabel}
          isCollapsed={isRightSidebarCollapsed || isFocusMode}
          onCollapseToggle={
            !isFocusMode
              ? () => setIsRightSidebarCollapsed((prev) => !prev)
              : undefined
          }
        />
      </div>
    </div>
  );
}
