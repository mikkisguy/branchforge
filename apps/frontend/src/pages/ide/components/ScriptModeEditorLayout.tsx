import { useCallback, useState } from "react";
import { Sparkles, X, ChevronRight, ChevronLeft } from "lucide-react";
import { cva } from "class-variance-authority";
import { ScriptReferencePanel, ScriptEditor } from "@/components/script-mode";
import { ProjectFileTree } from "@/components/script-mode/ProjectFileTree";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import {
  EditorTabBar,
  type EditorTabBarItem,
  UndoRedoControls,
} from "@/components/ide-shared";
import { Button } from "@/components/ui/button";
import { CharacterEditDialog } from "@/components/CharacterEditDialog.lazy";
import type { LabelDetail } from "@branchforge/shared";
import type { Character } from "@branchforge/shared";
import type { ScriptEditorRef } from "@/components/script-mode/ScriptEditor";
import type { FocusModeState } from "@/hooks/useFocusModeState";
import type { ProjectFileNode } from "@/hooks/useProjectFiles";
import type { SaveStatus } from "@/hooks/useAutosave";
import type { LabelTitleMap } from "@/lib/codemirror/label-title-decoration";
import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  RefObject,
  SetStateAction,
} from "react";

const sidebarVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-card/50 overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      variant: {
        collapsed: "w-0 opacity-0 -translate-x-full pointer-events-none",
        expanded:
          "w-56 opacity-100 translate-x-0 max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0",
      },
    },
    defaultVariants: {
      variant: "expanded",
    },
  }
);

interface ScriptModeEditorLayoutProps {
  projectName?: string;
  projectId?: string;
  projectFiles: ProjectFileNode[];
  activeFileId: string | null;
  activeLabelId: string | null;
  activeLabel: LabelDetail | undefined;
  activeProjectFile: ProjectFileNode | null;
  activeFileContent: string;
  scrollToLine: number | null;
  initialExpandedFolders: string[];
  tabItems: EditorTabBarItem[];
  projectCharacters: Character[];
  isLeftSidebarCollapsed: boolean;
  setIsLeftSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  isRightSidebarCollapsed: boolean;
  setIsRightSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  focusModeState: FocusModeState;
  editorRef: RefObject<ScriptEditorRef | null>;
  onFocusModeToggle: () => void;
  onFileSelect: (fileId: string) => void;
  onSceneSelect: (sceneId: string) => void;
  onSelectTab: (fileId: string) => void | Promise<void>;
  onCloseTab: (event: MouseEvent | KeyboardEvent, fileId: string) => void;
  onContentChange: (value: string) => void;
  onRefreshFiles: () => Promise<unknown>;
  onNewChapter?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus?: SaveStatus;
  saveConflict?: boolean;
  onSaveRequest?: () => void;
  labelTitles?: LabelTitleMap;
}

// react-doctor-disable-next-line react-doctor/no-many-boolean-props
export function ScriptModeEditorLayout({
  projectName,
  projectId,
  projectFiles,
  activeFileId,
  activeLabelId,
  activeLabel,
  activeProjectFile,
  activeFileContent,
  scrollToLine,
  initialExpandedFolders,
  tabItems,
  projectCharacters,
  isLeftSidebarCollapsed,
  setIsLeftSidebarCollapsed,
  isRightSidebarCollapsed,
  setIsRightSidebarCollapsed,
  focusModeState,
  editorRef,
  onFocusModeToggle,
  onFileSelect,
  onSceneSelect,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onRefreshFiles,
  onNewChapter,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus = "saved",
  saveConflict = false,
  onSaveRequest,
  labelTitles,
}: ScriptModeEditorLayoutProps) {
  const { isFocusMode, focusToggleRef } = focusModeState;
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );

  const toggleRightSidebar = useCallback(
    () => setIsRightSidebarCollapsed((previous) => !previous),
    [setIsRightSidebarCollapsed]
  );

  return (
    <>
      {isFocusMode && (
        <div className="fixed top-2 right-2 z-[100] pointer-events-auto">
          <FocusModeToggle
            ref={focusToggleRef}
            isFocusMode={isFocusMode}
            onToggle={onFocusModeToggle}
          />
        </div>
      )}

      <div className="flex-1 flex gap-4 px-4 max-md:px-0 pb-4 overflow-hidden min-h-0 min-w-0 relative">
        {/* Mobile scrim backdrop – collapses open overlays on tap */}
        {(!isLeftSidebarCollapsed || !isRightSidebarCollapsed) && (
          <div
            className="max-md:fixed max-md:inset-0 max-md:bg-black/40 max-md:z-30"
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
            <div className="sticky top-0 z-20 bg-card border-b border-border pl-10 pr-4 py-3">
              <button
                type="button"
                onClick={() => setIsLeftSidebarCollapsed(true)}
                className="absolute top-2 left-2 z-30 p-1 rounded-md hover:bg-muted/80 transition-colors"
                aria-label="Collapse project files sidebar"
                title="Collapse project files sidebar"
              >
                <ChevronLeft className="size-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-3">
                <div className="size-7 rounded bg-[var(--theme-color)] flex items-center justify-center shadow-sm shrink-0">
                  <Sparkles className="size-4 text-white" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">
                    {projectName || "Script Mode"}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {projectFiles.length} file
                    {projectFiles.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {onNewChapter && (
                <button
                  type="button"
                  onClick={onNewChapter}
                  className="w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors bg-[var(--theme-color)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + New Chapter
                </button>
              )}

              <ProjectFileTree
                files={projectFiles}
                activeFileId={activeFileId ?? undefined}
                activeSceneId={activeLabelId ?? undefined}
                onFileSelect={onFileSelect}
                onSceneSelect={onSceneSelect}
                initialExpandedFolders={initialExpandedFolders}
              />
            </div>
          </div>
        </div>

        {isLeftSidebarCollapsed && !isFocusMode && (
          <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4 max-md:fixed max-md:left-1 max-md:z-50 max-md:mt-0 max-md:-ml-0 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={() => setIsLeftSidebarCollapsed(false)}
              className="size-12 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors flex items-center justify-center"
              aria-label="Expand project files sidebar"
              title="Expand project files sidebar"
            >
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0 mt-3">
          {!isFocusMode && (
            <div className="mb-2 flex gap-2">
              <div className="flex-1 min-w-0">
                <EditorTabBar
                  items={tabItems}
                  activeItemId={activeFileId}
                  onSelect={onSelectTab}
                  onClose={onCloseTab}
                  idPrefix="script-tab-"
                  titleMaxWidthClassName="max-w-[240px]"
                />
              </div>
              <div className="h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 opacity-100 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="h-full flex items-center justify-end gap-3 px-3">
                  <UndoRedoControls
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={onUndo}
                    onRedo={onRedo}
                  />
                  <FocusModeToggle
                    ref={focusToggleRef}
                    isFocusMode={isFocusMode}
                    onToggle={onFocusModeToggle}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            <div className="bg-card/50 border border-border rounded-lg h-full overflow-hidden min-h-0 min-w-0">
              {activeProjectFile ? (
                <ScriptEditor
                  ref={editorRef}
                  content={activeFileContent}
                  scrollToLine={scrollToLine}
                  onChange={onContentChange}
                  isFocusMode={isFocusMode}
                  saveStatus={saveStatus}
                  saveConflict={saveConflict}
                  onSaveRequest={onSaveRequest}
                  labelTitles={labelTitles}
                />
              ) : activeLabel ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <X size={16} />
                    <span className="font-medium">Scene not found</span>
                  </div>
                  <p className="text-sm max-w-md text-center">
                    The file containing this scene could not be found. It may
                    have been deleted or there was an error loading the project
                    files.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRefreshFiles}
                  >
                    Refresh files
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a file or scene to view its content
                </div>
              )}
            </div>
          </div>
        </div>

        <ScriptReferencePanel
          projectId={projectId ?? ""}
          projectCharacters={projectCharacters}
          isCollapsed={isRightSidebarCollapsed || isFocusMode}
          onCollapseToggle={!isFocusMode ? toggleRightSidebar : undefined}
          onCharacterEdit={setEditingCharacterId}
        />
      </div>

      <CharacterEditDialog
        open={editingCharacterId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCharacterId(null);
        }}
        projectId={projectId ?? ""}
        characterId={editingCharacterId ?? undefined}
      />
    </>
  );
}
