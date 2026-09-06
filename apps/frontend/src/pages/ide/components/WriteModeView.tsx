import { useState } from "react";
import {
  ProseEditor,
  LabelNavigator,
  LabelPropertiesPanel,
} from "@/components/write-mode";
import type { ProseEditorRef } from "@/components/write-mode";
import { SaveIndicator } from "@/components/write-mode/SaveIndicator";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { ProseEditorStatusBar } from "@/components/write-mode/ProseEditor/ProseEditorStatusBar";
import { propsToSaveStatus } from "@/components/write-mode/ProseEditor/utils/proseEditorUtils";
import { EditorTabBar, UndoRedoControls } from "@/components/ide-shared";
import { WorkspaceFrameLayout } from "@/components/workspace/WorkspaceFrame";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import { WorkspaceStatusBar } from "@/components/workspace/WorkspaceStatusBar";
import { WRITE_LEFT_PANEL, WRITE_RIGHT_PANEL } from "@/lib/workspace-panels";
import { WriteModeFAB } from "@/pages/ide/components/WriteModeFAB";
import { WriteModeDialogs } from "@/pages/ide/components/WriteModeDialogs";
import type { WriteModeViewProps } from "@/pages/ide/components/WriteModeView.types";
import { useWriteModeView } from "@/pages/ide/components/useWriteModeView";
import type { RefObject } from "react";

export function WriteModeView({
  isFocusMode,
  focusToggleRef,
  onFocusModeToggle,
  leftPanelRaw,
  rightPanelRaw,
  labels,
  activeLabelId,
  onLabelSelect,
  onCloseTab,
  tabItems,
  projectId,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  labelMutationState,
  editorRef,
  activeLabel,
  characters,
  onChange,
  editorSaveState,
  onUndoStateChange,
  onWordCountChange,
  stats,
  routeConfigs,
  pairGroups,
  proseUndoState,
  wordCountState,
  duoEndingEnabled,
}: WriteModeViewProps) {
  const [editorMetrics, setEditorMetrics] = useState({
    wordCount: 0,
    lineCount: 0,
  });

  const {
    writeFontSize,
    setWriteFontSize,
    writeFontFamily,
    setWriteFontFamily,
    writeLineLayout,
    setWriteLineLayout,
    showBadges,
    setShowBadges,
    editDialog,
    setEditDialog,
    deleteConfirm,
    setDeleteConfirm,
    editingCharacterId,
    setEditingCharacterId,
    handleEditLabel,
    handleDeleteRequest,
    handleEditFromPanel,
    handleEditSave,
    handleDeleteConfirmAction,
    pairGroupSummaries,
    WRITE_FONT_SIZE_OPTIONS,
    FONT_FAMILY_OPTIONS,
  } = useWriteModeView(activeLabel, onUpdateLabel, onDeleteLabel, pairGroups);

  const saveStatus = propsToSaveStatus(
    editorSaveState.isSaving,
    editorSaveState.saveError
  );

  const handleUndo = () => {
    editorRef.current?.undo();
  };

  const handleRedo = () => {
    editorRef.current?.redo();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkspaceFrameLayout
        leftConfig={WRITE_LEFT_PANEL}
        rightConfig={WRITE_RIGHT_PANEL}
        leftPanelRaw={leftPanelRaw}
        rightPanelRaw={rightPanelRaw}
        isFocusMode={isFocusMode}
        leftPanelId="write-left-panel"
        rightPanelId="write-right-panel"
        left={
          <LabelNavigator
            labels={labels}
            activeLabelId={activeLabelId}
            onSelect={onLabelSelect}
            onCreateLabel={async (data) => {
              await onCreateLabel({ projectId, ...data });
            }}
            isCreatingLabel={labelMutationState.isCreatingLabel}
            onUpdateLabel={async (labelId, data) => {
              return onUpdateLabel(labelId, data);
            }}
            isUpdatingLabel={labelMutationState.isUpdatingLabel}
            onEditLabel={handleEditLabel}
            onDeleteRequest={handleDeleteRequest}
          />
        }
        right={
          <LabelPropertiesPanel
            activeLabel={activeLabel}
            characters={characters}
            stats={stats}
            routeConfigs={routeConfigs}
            pairGroups={pairGroupSummaries}
            onEdit={handleEditFromPanel}
            onCharacterEdit={setEditingCharacterId}
          />
        }
        toolbar={
          <WorkspaceToolbar showPanelToggles>
            <div className="flex min-h-0 min-w-0 flex-1 items-center">
              <EditorTabBar
                items={tabItems}
                activeItemId={activeLabelId}
                onSelect={onLabelSelect}
                onClose={onCloseTab}
                idPrefix="tab-"
                titleMaxWidthClassName="max-w-[180px]"
              />
            </div>
            <div className="max-md:hidden">
              <UndoRedoControls
                canUndo={proseUndoState.canUndo}
                canRedo={proseUndoState.canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            </div>
            <SaveIndicator
              saveStatus={saveStatus}
              displayMode="compact"
              lastSaved={editorSaveState.lastSaved}
              saveConflict={editorSaveState.saveConflict}
            />
            <FocusModeToggle
              ref={focusToggleRef}
              isFocusMode={isFocusMode}
              onToggle={onFocusModeToggle}
            />
          </WorkspaceToolbar>
        }
        editor={
          <div className="flex h-full min-h-0 w-full justify-center">
            <div className="h-full min-h-0 w-full max-w-3xl">
              <ProseEditor
                key={activeLabel?.id ?? "__no_label__"}
                ref={editorRef}
                activeLabel={activeLabel}
                characters={characters}
                onChange={onChange}
                isFocusMode={isFocusMode}
                hideChrome
                isSaving={editorSaveState.isSaving}
                lastSaved={editorSaveState.lastSaved}
                saveError={editorSaveState.saveError}
                saveConflict={editorSaveState.saveConflict}
                onUndoStateChange={onUndoStateChange}
                onWordCountChange={onWordCountChange}
                onEditorMetricsChange={setEditorMetrics}
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
        }
        statusBar={
          <WorkspaceStatusBar className="max-md:hidden">
            <div className="flex min-h-0 min-w-0 flex-1 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:px-0 [&>div]:py-0">
              <ProseEditorStatusBar
                layoutMode={writeLineLayout as "inline" | "stacked"}
                onLayoutModeChange={setWriteLineLayout}
                showBadges={showBadges}
                onShowBadgesToggle={() => setShowBadges(!showBadges)}
                wordCount={editorMetrics.wordCount}
                lineCount={editorMetrics.lineCount}
                fontSizeValue={writeFontSize}
                onFontSizeChange={setWriteFontSize}
                fontFamilyValue={writeFontFamily}
                onFontFamilyChange={setWriteFontFamily}
                isFocusMode={false}
                isBottomBarHovered
                onBottomBarHoverStart={() => undefined}
                onBottomBarHoverEnd={() => undefined}
              />
            </div>
          </WorkspaceStatusBar>
        }
        focusChrome={
          <div className="pointer-events-auto fixed top-2 right-2 z-[100] flex items-center gap-2">
            <SaveIndicator
              saveStatus={saveStatus}
              displayMode="compact"
              lastSaved={editorSaveState.lastSaved}
              saveConflict={editorSaveState.saveConflict}
            />
            <FocusModeToggle
              ref={focusToggleRef}
              isFocusMode={isFocusMode}
              onToggle={onFocusModeToggle}
            />
          </div>
        }
      />

      <WriteModeFAB
        fontSizeValue={writeFontSize}
        onFontSizeChange={setWriteFontSize}
        fontSizeOptions={WRITE_FONT_SIZE_OPTIONS}
        fontFamilyValue={writeFontFamily}
        onFontFamilyChange={setWriteFontFamily}
        fontFamilyOptions={FONT_FAMILY_OPTIONS}
        layoutMode={writeLineLayout as "inline" | "stacked"}
        onLayoutModeChange={setWriteLineLayout}
        showBadges={showBadges}
        onShowBadgesChange={setShowBadges}
        proseUndoState={proseUndoState}
        wordCountState={wordCountState}
        isFocusMode={isFocusMode}
        onFocusModeToggle={onFocusModeToggle}
        editorRef={editorRef as RefObject<ProseEditorRef | null>}
      />

      <WriteModeDialogs
        editDialog={editDialog}
        onEditDialogChange={setEditDialog}
        deleteConfirm={deleteConfirm}
        onDeleteConfirmChange={setDeleteConfirm}
        editingCharacterId={editingCharacterId}
        onEditingCharacterIdChange={setEditingCharacterId}
        routeConfigs={routeConfigs}
        pairGroupSummaries={pairGroupSummaries}
        duoEndingEnabled={duoEndingEnabled}
        projectId={projectId}
        onEditSave={handleEditSave}
        onDeleteConfirmAction={handleDeleteConfirmAction}
        isUpdatingLabel={labelMutationState.isUpdatingLabel}
        isDeletingLabel={labelMutationState.isDeletingLabel}
      />
    </div>
  );
}
