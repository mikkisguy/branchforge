import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignJustify,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Redo2,
  Sparkles,
  Undo2,
  WrapText,
  X,
  Type,
  Palette,
} from "lucide-react";
import { cva } from "class-variance-authority";
import { ScriptReferencePanel, ScriptEditor } from "@/components/script-mode";
import { ProjectFileTree } from "@/components/script-mode/ProjectFileTree";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import {
  EditorTabBar,
  type EditorTabBarItem,
  FABExpandableChoice,
  FABToggle,
  MobileOverflowFAB,
  UndoRedoControls,
  useFABPopover,
} from "@/components/ide-shared";
import { Button } from "@/components/ui/button";
import { CharacterEditDialog } from "@/components/CharacterEditDialog.lazy";
import type { LabelDetail } from "@branchforge/shared";
import type { Character } from "@branchforge/shared";
import type { ScriptEditorRef } from "@/components/script-mode/ScriptEditor";
import type { FocusModeState } from "@/hooks/useFocusModeState";
import type { ProjectFileNode } from "@/hooks/useProjectFiles";
import type { SaveStatus } from "@/hooks/useAutosave";
import {
  useLocalStorageBoolean,
  useLocalStorageNumber,
} from "@/hooks/useLocalStorage";
import { PALETTES, applyPalette } from "@/lib/codemirror/palettes";
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
        collapsed:
          "w-0 opacity-0 -translate-x-full pointer-events-none max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:mt-0 max-md:rounded-none",
        expanded:
          "w-56 opacity-100 translate-x-0 max-md:absolute max-md:z-50 max-md:left-0 max-md:top-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0 max-md:bg-card",
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
  isMobile: boolean;
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

// ── FAB action button helpers ──────────────────────────────────────────

function FABUndoButton({
  canUndo,
  onUndo,
}: {
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { closePopover } = useFABPopover();
  return (
    <button
      type="button"
      onClick={() => {
        onUndo();
        closePopover();
      }}
      disabled={!canUndo}
      aria-disabled={!canUndo}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
    >
      <Undo2 className="size-4" />
      Undo
    </button>
  );
}

function FABRedoButton({
  canRedo,
  onRedo,
}: {
  canRedo: boolean;
  onRedo: () => void;
}) {
  const { closePopover } = useFABPopover();
  return (
    <button
      type="button"
      onClick={() => {
        onRedo();
        closePopover();
      }}
      disabled={!canRedo}
      aria-disabled={!canRedo}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
    >
      <Redo2 className="size-4" />
      Redo
    </button>
  );
}

function FABFocusButton({
  isFocusMode,
  onToggle,
}: {
  isFocusMode: boolean;
  onToggle: () => void;
}) {
  const { closePopover } = useFABPopover();
  return (
    <button
      type="button"
      onClick={() => {
        onToggle();
        closePopover();
      }}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
    >
      {isFocusMode ? (
        <Minimize2 className="size-4" />
      ) : (
        <Maximize2 className="size-4" />
      )}
      {isFocusMode ? "Exit Focus" : "Focus Mode"}
    </button>
  );
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
  isMobile,
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

  // ── Mobile FAB settings state (mirrors ScriptEditor/desktop status bar) ──

  const SCRIPT_FONT_SIZE_OPTIONS = useMemo(
    () =>
      [
        { label: "Small", value: 12 },
        { label: "Medium", value: 14 },
        { label: "Large", value: 16 },
        { label: "Extra Large", value: 18 },
        { label: "Huge", value: 20 },
      ] as const,
    []
  );

  const [scriptFontSize, setScriptFontSize] = useLocalStorageNumber(
    "script:font-size",
    14,
    { validate: (v) => SCRIPT_FONT_SIZE_OPTIONS.some((o) => o.value === v) }
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${scriptFontSize}px`
    );
  }, [scriptFontSize]);

  const [paletteIndex, setPaletteIndex] = useLocalStorageNumber(
    "editor:syntax-palette",
    0,
    { validate: (v) => v >= 0 && v < PALETTES.length }
  );

  useEffect(() => {
    if (PALETTES[paletteIndex]) {
      applyPalette(PALETTES[paletteIndex]);
    }
  }, [paletteIndex]);

  const [lineWrap, setLineWrap] = useLocalStorageBoolean(
    "script:line-wrap",
    false
  );

  const [showLabelTitles, setShowLabelTitles] = useLocalStorageBoolean(
    "script:show-label-titles",
    true
  );

  // On mobile, only one overlay sidebar may be open at a time. Opening
  // one closes the other so the two panels never stack on a narrow viewport.
  const openLeftSidebar = useCallback(() => {
    setIsLeftSidebarCollapsed(false);
    if (isMobile) setIsRightSidebarCollapsed(true);
  }, [isMobile, setIsLeftSidebarCollapsed, setIsRightSidebarCollapsed]);

  const toggleRightSidebar = useCallback(() => {
    setIsRightSidebarCollapsed((previous) => !previous);
    if (isMobile) setIsLeftSidebarCollapsed(true);
  }, [isMobile, setIsLeftSidebarCollapsed, setIsRightSidebarCollapsed]);

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

      <div className="flex-1 flex gap-4 px-4 max-md:px-2 pb-4 max-md:pb-0 overflow-hidden min-h-0 min-w-0 relative ">
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
          <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4 max-md:hidden">
            <button
              type="button"
              onClick={openLeftSidebar}
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
            <div className="mb-2 flex gap-2 items-center">
              {isLeftSidebarCollapsed && (
                <button
                  type="button"
                  onClick={openLeftSidebar}
                  className="md:hidden h-12 w-9 shrink-0 rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm flex items-center justify-center"
                  aria-label="Expand project files sidebar"
                  title="Expand project files sidebar"
                >
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              )}
              <div className="flex-1 min-w-0 h-12 overflow-hidden">
                <EditorTabBar
                  items={tabItems}
                  activeItemId={activeFileId}
                  onSelect={onSelectTab}
                  onClose={onCloseTab}
                  idPrefix="script-tab-"
                  titleMaxWidthClassName="max-w-[240px]"
                />
              </div>
              <div className="h-12 overflow-hidden rounded-lg border border-border/80 bg-card/55 opacity-100 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] max-md:hidden">
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
              {isRightSidebarCollapsed && (
                <button
                  type="button"
                  onClick={toggleRightSidebar}
                  className="md:hidden h-12 w-9 shrink-0 rounded-lg border border-border/80 bg-card/55 backdrop-blur-sm flex items-center justify-center"
                  aria-label="Expand reference sidebar"
                  title="Expand reference sidebar"
                >
                  <ChevronLeft className="size-4 text-muted-foreground" />
                </button>
              )}
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
                  lineWrap={lineWrap}
                  onLineWrapChange={setLineWrap}
                  showLabelTitles={showLabelTitles}
                  onShowLabelTitlesChange={setShowLabelTitles}
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

      {/* Mobile FAB — settings at top, actions closest to thumb */}
      <MobileOverflowFAB aria-label="Editor actions">
        <FABExpandableChoice
          icon={<Type className="size-4" />}
          label="Font Size"
          currentLabel={
            SCRIPT_FONT_SIZE_OPTIONS.find((o) => o.value === scriptFontSize)
              ?.label ?? "Medium"
          }
          options={SCRIPT_FONT_SIZE_OPTIONS.map((o) => ({
            label: o.label,
            value: o.value,
            active: o.value === scriptFontSize,
          }))}
          onSelect={(v: string | number) => setScriptFontSize(v as number)}
        />
        <FABExpandableChoice
          icon={<Palette className="size-4" />}
          label="Syntax Theme"
          currentLabel={PALETTES[paletteIndex]?.name ?? "Default"}
          options={PALETTES.map((p, i) => ({
            label: p.name,
            value: i,
            active: i === paletteIndex,
          }))}
          onSelect={(v: string | number) => setPaletteIndex(v as number)}
        />
        <FABToggle
          icon={
            lineWrap ? (
              <WrapText className="size-4" />
            ) : (
              <AlignJustify className="size-4" />
            )
          }
          label="Line Wrap"
          active={lineWrap}
          onClick={() => setLineWrap((v) => !v)}
        />
        <FABToggle
          icon={
            showLabelTitles ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )
          }
          label="Show Titles"
          active={showLabelTitles}
          onClick={() => setShowLabelTitles((v) => !v)}
        />
        <div className="h-px bg-border/30 my-1" />
        <FABFocusButton
          isFocusMode={isFocusMode}
          onToggle={onFocusModeToggle}
        />
        <FABUndoButton canUndo={canUndo} onUndo={onUndo} />
        <FABRedoButton canRedo={canRedo} onRedo={onRedo} />
      </MobileOverflowFAB>
    </>
  );
}
