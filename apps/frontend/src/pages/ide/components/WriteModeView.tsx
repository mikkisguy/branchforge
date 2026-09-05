import { ChevronRight, ChevronLeft } from "lucide-react";
import {
  ProseEditor,
  LabelNavigator,
  LabelPropertiesPanel,
} from "@/components/write-mode";
import type { ProseEditorRef } from "@/components/write-mode";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { EditorTabBar } from "@/components/ide-shared";
import { WriteModeFAB } from "@/pages/ide/components/WriteModeFAB";
import { WriteModeDialogs } from "@/pages/ide/components/WriteModeDialogs";
import type { WriteModeViewProps } from "@/pages/ide/components/WriteModeView.types";
import { useWriteModeView } from "@/pages/ide/components/useWriteModeView";
import type { RefObject } from "react";

const SIDEBAR_COLLAPSED =
  "w-0 opacity-0 -translate-x-full pointer-events-none max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:mt-0 max-md:rounded-none";
const SIDEBAR_EXPANDED =
  "w-60 opacity-100 translate-x-0 max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0 max-md:bg-card";

export function WriteModeView({
  isFocusMode,
  focusToggleRef,
  onFocusModeToggle,
  sidebarState,
  isMobile,
  storyFiles,
  revealFileId,
  sortResetToken,
  labels,
  activeLabelId,
  onNewFile,
  onFileRevealed,

  onLabelSelect,
  onCloseTab,
  tabItems,
  projectName,
  projectId,
  projectLabelCount,
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
  const {
    isLeftCollapsed: isLeftSidebarCollapsed,
    setIsLeftCollapsed: setIsLeftSidebarCollapsed,
    isRightCollapsed: isRightSidebarCollapsed,
    setIsRightCollapsed: setIsRightSidebarCollapsed,
  } = sidebarState;

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
    handleOpenLeftSidebar,
    handleToggleRightSidebar,
    pairGroupSummaries,
    WRITE_FONT_SIZE_OPTIONS,
    FONT_FAMILY_OPTIONS,
  } = useWriteModeView(
    isMobile,
    setIsLeftSidebarCollapsed,
    setIsRightSidebarCollapsed,
    activeLabel,
    onUpdateLabel,
    onDeleteLabel,
    pairGroups
  );

  return (
    <>
      {isFocusMode && (
        <div className="fixed top-2 right-2 z-[100] pointer-events-auto max-md:hidden">
          <FocusModeToggle
            ref={focusToggleRef}
            isFocusMode={isFocusMode}
            onToggle={onFocusModeToggle}
          />
        </div>
      )}

      <div className="flex-1 flex gap-4 px-4 max-md:px-0 pb-0 overflow-hidden min-h-0 min-w-0 relative">
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
          className={`min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out ${
            isFocusMode || isLeftSidebarCollapsed
              ? SIDEBAR_COLLAPSED
              : SIDEBAR_EXPANDED
          }`}
        >
          <div className="h-full overflow-y-auto relative">
            <LabelNavigator
              labels={labels}
              storyFiles={storyFiles}
              activeLabelId={activeLabelId}
              onSelect={onLabelSelect}
              projectName={projectName}
              projectLabelCount={projectLabelCount}
              onToggleCollapse={() => setIsLeftSidebarCollapsed(true)}
              revealFileId={revealFileId}
              sortResetToken={sortResetToken}
              onNewFile={onNewFile}
              onFileRevealed={onFileRevealed}
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
          </div>
        </div>

        {isLeftSidebarCollapsed && !isFocusMode && (
          <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4 max-md:hidden">
            <button
              type="button"
              onClick={handleOpenLeftSidebar}
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
                  onClick={handleOpenLeftSidebar}
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
                  onSelect={onLabelSelect}
                  onClose={onCloseTab}
                  idPrefix="tab-"
                  titleMaxWidthClassName="max-w-[180px]"
                />
              </div>
              <div className="h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] max-md:hidden">
                <div className="h-full flex items-center justify-end px-3">
                  <FocusModeToggle
                    ref={focusToggleRef}
                    isFocusMode={isFocusMode}
                    onToggle={onFocusModeToggle}
                  />
                </div>
              </div>
              {isRightSidebarCollapsed && (
                <button
                  type="button"
                  onClick={handleToggleRightSidebar}
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
                key={activeLabel?.id ?? "__no_label__"}
                ref={editorRef}
                activeLabel={activeLabel}
                characters={characters}
                onChange={onChange}
                isFocusMode={isFocusMode}
                isSaving={editorSaveState.isSaving}
                lastSaved={editorSaveState.lastSaved}
                saveError={editorSaveState.saveError}
                saveConflict={editorSaveState.saveConflict}
                onUndoStateChange={onUndoStateChange}
                onWordCountChange={onWordCountChange}
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
          onCollapseToggle={!isFocusMode ? handleToggleRightSidebar : undefined}
          onEdit={handleEditFromPanel}
          onCharacterEdit={setEditingCharacterId}
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
    </>
  );
}
