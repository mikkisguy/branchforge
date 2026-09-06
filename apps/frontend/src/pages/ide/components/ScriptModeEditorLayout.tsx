import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignJustify,
  Eye,
  EyeOff,
  Type,
  Palette,
  WrapText,
  X,
} from "lucide-react";
import {
  ScriptReferencePanel,
  ScriptEditor,
  StatusBar,
} from "@/components/script-mode";
import {
  ProjectFileTree,
  type GeneratedFileInfo,
} from "@/components/script-mode/ProjectFileTree";
import { FocusModeToggle } from "@/components/write-mode/FocusModeToggle";
import { SaveIndicator } from "@/components/write-mode/SaveIndicator";
import { EDITOR_FONT_SIZE_CHANGED } from "@/components/FontSizeSwitcher";
import {
  EditorTabBar,
  type EditorTabBarItem,
  FABExpandableChoice,
  FABToggle,
  FABUndoButton,
  FABRedoButton,
  FABFocusButton,
  MobileOverflowFAB,
  UndoRedoControls,
} from "@/components/ide-shared";
import { Button } from "@/components/ui/button";
import { CharacterEditDialog } from "@/components/CharacterEditDialog/CharacterEditDialog.lazy";
import { WorkspaceFrameLayout } from "@/components/workspace/WorkspaceFrame";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import { WorkspaceStatusBar } from "@/components/workspace/WorkspaceStatusBar";
import { ScriptEditorFormattingControls } from "@/components/script-mode/ScriptEditor/ScriptEditorToolbar";
import { ScriptEditorToolbarPlacementContext } from "@/components/script-mode/ScriptEditor/script-editor-toolbar-context";
import { useWorkspacePanel } from "@/hooks/useWorkspacePanel";
import { useFocusModeKeyboardHandler } from "@/hooks/useFocusModeKeyboardHandler";
import { SCRIPT_LEFT_PANEL, SCRIPT_RIGHT_PANEL } from "@/lib/workspace-panels";
import type { LabelDetail, Character, SourceOrigin } from "@branchforge/shared";
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
import type { KeyboardEvent, MouseEvent, RefObject } from "react";

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
  gitlabBranch?: string;
  fileSourceType?: SourceOrigin;
  onOpenZipImportDialog?: () => void;
  generatedFiles?: GeneratedFileInfo[];
  activeGeneratedFileId?: string | null;
  onGeneratedFileSelect?: (fileName: string) => void;
  isGeneratedPreview?: boolean;
  generatedFileName?: string;
}

// react-doctor-disable-next-line react-doctor/no-many-boolean-props, react-doctor/no-giant-component
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
  gitlabBranch,
  fileSourceType,
  onOpenZipImportDialog,
  generatedFiles,
  activeGeneratedFileId,
  onGeneratedFileSelect,
  isGeneratedPreview = false,
  generatedFileName,
}: ScriptModeEditorLayoutProps) {
  const leftPanelRaw = useWorkspacePanel(SCRIPT_LEFT_PANEL);
  const rightPanelRaw = useWorkspacePanel(SCRIPT_RIGHT_PANEL);
  const {
    isFocusMode,
    focusToggleRef,
    preFocusSidebarStates,
    setPreFocusSidebarStates,
  } = focusModeState;
  const isMobile = leftPanelRaw.breakpoint === "mobile";

  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );

  const handleFocusModeToggle = useCallback(() => {
    if (!isFocusMode) {
      setPreFocusSidebarStates({
        leftCollapsed: leftPanelRaw.collapsed,
        rightCollapsed: rightPanelRaw.collapsed,
      });
      onFocusModeToggle();
      return;
    }

    if (preFocusSidebarStates) {
      leftPanelRaw.setCollapsed(preFocusSidebarStates.leftCollapsed);
      rightPanelRaw.setCollapsed(preFocusSidebarStates.rightCollapsed);
    }
    onFocusModeToggle();
  }, [
    isFocusMode,
    leftPanelRaw,
    onFocusModeToggle,
    preFocusSidebarStates,
    rightPanelRaw,
    setPreFocusSidebarStates,
  ]);

  useFocusModeKeyboardHandler(handleFocusModeToggle);

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
    window.dispatchEvent(
      new CustomEvent(EDITOR_FONT_SIZE_CHANGED, {
        detail: { fontSize: scriptFontSize },
      })
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

  const [storedLineWrap, setStoredLineWrap] = useLocalStorageBoolean(
    "script:line-wrap",
    false
  );
  const [mobileLineWrap, setMobileLineWrap] = useState(true);
  const [wasMobile, setWasMobile] = useState(isMobile);
  if (isMobile !== wasMobile) {
    setWasMobile(isMobile);
    if (isMobile) {
      setMobileLineWrap(true);
    }
  }

  const lineWrap = isMobile ? mobileLineWrap : storedLineWrap;

  const handleLineWrapToggle = useCallback(() => {
    if (isMobile) {
      setMobileLineWrap((value) => !value);
    } else {
      setStoredLineWrap((value) => !value);
    }
  }, [isMobile, setStoredLineWrap]);

  const handleLineWrapChange = useCallback(
    (wrap: boolean) => {
      if (isMobile) {
        setMobileLineWrap(wrap);
      } else {
        setStoredLineWrap(wrap);
      }
    },
    [isMobile, setStoredLineWrap]
  );

  const [showOverlays, setShowOverlays] = useLocalStorageBoolean(
    "script:show-label-titles",
    true
  );

  const editorContent =
    isGeneratedPreview && generatedFileName ? (
      <>
        <div className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-1.5 text-xs italic text-muted-foreground">
          Read-only preview · {generatedFileName}
        </div>
        <div className="min-h-0 flex-1">
          <ScriptEditor
            content={activeFileContent}
            readOnly
            onChange={undefined}
            isFocusMode={isFocusMode}
            saveStatus="saved"
            saveConflict={false}
            labelTitles={labelTitles}
            lineWrap={lineWrap}
            onLineWrapChange={handleLineWrapChange}
            showOverlays={showOverlays}
            onShowOverlaysChange={setShowOverlays}
            projectId={projectId}
          />
        </div>
      </>
    ) : activeProjectFile ? (
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
        onLineWrapChange={handleLineWrapChange}
        showOverlays={showOverlays}
        onShowOverlaysChange={setShowOverlays}
        projectId={projectId}
      />
    ) : activeLabel ? (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex items-center gap-2 text-destructive">
          <X size={16} />
          <span className="font-medium">Scene not found</span>
        </div>
        <p className="max-w-md text-center text-sm">
          The file containing this scene could not be found. It may have been
          deleted or there was an error loading the project files.
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
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a file or scene to view its content
      </div>
    );

  return (
    <>
      <ScriptEditorToolbarPlacementContext value="workspace">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <WorkspaceFrameLayout
            leftConfig={SCRIPT_LEFT_PANEL}
            rightConfig={SCRIPT_RIGHT_PANEL}
            leftPanelRaw={leftPanelRaw}
            rightPanelRaw={rightPanelRaw}
            isFocusMode={isFocusMode}
            leftPanelId="script-navigator-panel"
            leftLabelledBy="script-navigator-heading"
            rightPanelId="script-reference-panel"
            left={
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <div
                  id="script-navigator-heading"
                  className="shrink-0 border-b border-border px-3 py-2"
                >
                  <p className="text-xs text-muted-foreground">
                    {projectFiles.length} file
                    {projectFiles.length !== 1 ? "s" : ""}
                    {projectName ? ` · ${projectName}` : ""}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-2">
                  {onNewChapter ? (
                    <button
                      type="button"
                      onClick={onNewChapter}
                      className="mb-3 w-full rounded px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: "var(--theme-color)" }}
                    >
                      + New Chapter
                    </button>
                  ) : null}
                  <ProjectFileTree
                    files={projectFiles}
                    activeFileId={
                      isGeneratedPreview
                        ? undefined
                        : (activeFileId ?? undefined)
                    }
                    activeSceneId={activeLabelId ?? undefined}
                    onFileSelect={onFileSelect}
                    onSceneSelect={onSceneSelect}
                    initialExpandedFolders={initialExpandedFolders}
                    generatedFiles={generatedFiles}
                    activeGeneratedFileId={activeGeneratedFileId}
                    onGeneratedFileSelect={onGeneratedFileSelect}
                  />
                </div>
              </div>
            }
            right={
              <div className="h-full min-h-0 overflow-hidden">
                <ScriptReferencePanel
                  projectId={projectId ?? ""}
                  projectCharacters={projectCharacters}
                  onCharacterEdit={setEditingCharacterId}
                />
              </div>
            }
            toolbar={
              <WorkspaceToolbar showPanelToggles>
                <div className="flex min-h-0 min-w-0 flex-1 items-center">
                  <EditorTabBar
                    items={tabItems}
                    activeItemId={
                      isGeneratedPreview ? null : (activeFileId ?? null)
                    }
                    onSelect={onSelectTab}
                    onClose={onCloseTab}
                    idPrefix="script-tab-"
                    titleMaxWidthClassName="max-w-[240px]"
                  />
                </div>
                <div className="max-md:hidden">
                  <UndoRedoControls
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={onUndo}
                    onRedo={onRedo}
                  />
                </div>
                {saveStatus ? (
                  <SaveIndicator
                    saveStatus={saveStatus}
                    displayMode="compact"
                    saveConflict={saveConflict}
                    onRetry={onSaveRequest}
                  />
                ) : null}
                <FocusModeToggle
                  ref={focusToggleRef}
                  isFocusMode={isFocusMode}
                  onToggle={handleFocusModeToggle}
                />
              </WorkspaceToolbar>
            }
            editor={
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                {editorContent}
              </div>
            }
            statusBar={
              <WorkspaceStatusBar className="max-md:hidden min-w-0 justify-between gap-2 overflow-x-auto">
                {!isMobile ? (
                  <StatusBar
                    projectId={projectId}
                    projectName={projectName}
                    gitlabBranch={gitlabBranch}
                    fileSourceType={fileSourceType}
                    onOpenZipImportDialog={onOpenZipImportDialog}
                  />
                ) : null}
                <ScriptEditorFormattingControls
                  className="shrink-0 max-md:hidden"
                  lineWrap={lineWrap}
                  toggleLineWrap={handleLineWrapToggle}
                  showOverlays={showOverlays}
                  setShowOverlays={setShowOverlays}
                />
              </WorkspaceStatusBar>
            }
            focusChrome={
              <div className="pointer-events-auto fixed top-2 right-2 z-[100] flex items-center gap-2 max-md:hidden">
                {saveStatus ? (
                  <SaveIndicator
                    saveStatus={saveStatus}
                    displayMode="compact"
                    saveConflict={saveConflict}
                    onRetry={onSaveRequest}
                  />
                ) : null}
                <FocusModeToggle
                  ref={focusToggleRef}
                  isFocusMode={isFocusMode}
                  onToggle={handleFocusModeToggle}
                />
              </div>
            }
          />
        </div>
      </ScriptEditorToolbarPlacementContext>

      <CharacterEditDialog
        open={editingCharacterId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCharacterId(null);
        }}
        projectId={projectId ?? ""}
        characterId={editingCharacterId ?? undefined}
      />

      <MobileOverflowFAB aria-label="Editor actions">
        <FABExpandableChoice
          icon={<Type className="size-4" />}
          label="Font Size"
          currentLabel={
            SCRIPT_FONT_SIZE_OPTIONS.find(
              (option) => option.value === scriptFontSize
            )?.label ?? "Medium"
          }
          options={SCRIPT_FONT_SIZE_OPTIONS.map((option) => ({
            label: option.label,
            value: option.value,
            active: option.value === scriptFontSize,
          }))}
          onSelect={(value: string | number) =>
            setScriptFontSize(value as number)
          }
        />
        <FABExpandableChoice
          icon={<Palette className="size-4" />}
          label="Syntax Theme"
          currentLabel={PALETTES[paletteIndex]?.name ?? "Default"}
          options={PALETTES.map((palette, index) => ({
            label: palette.name,
            value: index,
            active: index === paletteIndex,
          }))}
          onSelect={(value: string | number) =>
            setPaletteIndex(value as number)
          }
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
          onClick={handleLineWrapToggle}
        />
        <FABToggle
          icon={
            showOverlays ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )
          }
          label="Show Overlays"
          active={showOverlays}
          onClick={() => setShowOverlays((value) => !value)}
        />
        <div className="my-1 h-px bg-border/30" />
        {isMobile ? (
          <div className="px-1 py-1">
            <StatusBar
              projectId={projectId}
              projectName={projectName}
              gitlabBranch={gitlabBranch}
              fileSourceType={fileSourceType}
              onOpenZipImportDialog={onOpenZipImportDialog}
              className="flex-col items-stretch"
            />
          </div>
        ) : null}
        <div className="my-1 h-px bg-border/30" />
        <FABFocusButton
          isFocusMode={isFocusMode}
          onToggle={handleFocusModeToggle}
        />
        <FABUndoButton canUndo={canUndo} onUndo={onUndo} />
        <FABRedoButton canRedo={canRedo} onRedo={onRedo} />
      </MobileOverflowFAB>
    </>
  );
}
