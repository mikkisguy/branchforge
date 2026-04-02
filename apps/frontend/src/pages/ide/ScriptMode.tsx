import { useState, useMemo, useEffect, useCallback } from "react";
import { Download, Package } from "lucide-react";
import { StoryPanel } from "@/components/ide-shared";
import { BookmarkTab, StatusBar, ScriptEditor } from "@/components/script-mode";
import { ProjectFileTree } from "@/components/script-mode/ProjectFileTree";
import { useLabels } from "@/hooks/useLabels";
import { useGitLab } from "@/hooks/useGitLab";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { generateRpyPlainText } from "@/lib/rpy-generator";
import { sanitizeLabelName } from "@/lib/label-utils";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
import { ZipImportDialog } from "@/components/zip-import";
import { Button } from "@/components/ui/button";

interface ScriptModeProps {
  themeName: string;
  projectId?: string;
  projectName?: string;
  gitlabBranch?: string;
}

export function ScriptMode({
  themeName,
  projectId,
  projectName,
  gitlabBranch,
}: ScriptModeProps) {
  const { activeLabel, activeLabelId, setActiveLabelId, isLoadingLabels } =
    useLabels();

  const { isProjectLinked, getLinkedRepository } = useGitLab();
  const { files: projectFiles, isLoadingFiles } = useProjectFiles(projectId);

  // Sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showZipImportDialog, setShowZipImportDialog] = useState(false);

  // Track active file for Script Mode
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const activeProjectFile = useMemo(
    () => projectFiles.find((f) => f.id === activeFileId) || null,
    [projectFiles, activeFileId]
  );

  // Track the line number to scroll to when switching modes
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);

  // Helper: Find the line number where a label starts in the file content
  const findLabelLineNumber = useCallback(
    (fileContent: string, labelTitle: string): number | null => {
      const labelName = sanitizeLabelName(labelTitle);
      const lines = fileContent.split("\n");

      // Find the line with "label {name}:" pattern
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("label ") && line.endsWith(":")) {
          const extractedLabel = line.slice(6, -1).trim();
          if (extractedLabel === labelName) {
            return i + 1; // Line numbers are 1-indexed
          }
        }
      }

      return null;
    },
    []
  );

  // When script mode has an active label, select its file and scroll to the label line
  useEffect(() => {
    if (!activeLabelId) {
      return;
    }

    const fileWithLabel = projectFiles.find((f) =>
      f.labels.some((l) => l.id === activeLabelId)
    );

    if (!fileWithLabel) {
      return;
    }

    setActiveFileId((currentFileId) =>
      currentFileId === fileWithLabel.id ? currentFileId : fileWithLabel.id
    );

    const labelMetadata = fileWithLabel.labels.find(
      (l) => l.id === activeLabelId
    );
    if (!labelMetadata) {
      setScrollToLine(null);
      return;
    }

    const lineNumber = findLabelLineNumber(
      fileWithLabel.content,
      labelMetadata.title
    );
    setScrollToLine(lineNumber);
  }, [activeLabelId, projectFiles, findLabelLineNumber]);

  // Generate RPY content for active scene (plain text for CodeMirror)
  const activeLabelPlainText = useMemo(() => {
    if (!activeLabel) return "";
    return generateRpyPlainText(activeLabel);
  }, [activeLabel]);

  // Get active file content directly for Script Mode editing
  const activeFileContent = activeProjectFile?.content || "";
  // Memoize file lines to avoid repeated split operations
  const activeFileLines = useMemo(
    () => activeFileContent.split("\n"),
    [activeFileContent]
  );
  // Memoize label lines to avoid repeated split operations
  const activeLabelLines = useMemo(
    () => activeLabelPlainText.split("\n"),
    [activeLabelPlainText]
  );

  // Handle GitLab file selection
  const handleGitLabFileSelect = (fileId: string) => {
    setActiveFileId(fileId);
    setScrollToLine(null);
    // Also clear the active scene since we're now in file mode
    setActiveLabelId(null);
  };

  // Handle GitLab scene selection (label within a file)
  const handleGitLabSceneSelect = (sceneId: string) => {
    setActiveLabelId(sceneId);
  };

  // Determine which folders should be expanded by default
  const initialExpandedFolders = useMemo(() => {
    const folders = new Set<string>();
    for (const file of projectFiles) {
      const parts = file.filePath.split("/");
      if (parts.length > 1) {
        folders.add(parts[0]);
      }
    }
    return Array.from(folders);
  }, [projectFiles]);

  // Character panel data
  const characters = useMemo(() => {
    return activeLabel?.characters ?? [];
  }, [activeLabel]);

  // Loading state
  if (isLoadingLabels || isLoadingFiles) {
    return (
      <div className="flex-1 flex flex-col pt-16">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading labels...</p>
        </div>
      </div>
    );
  }

  // No files state
  if (!projectFiles.length) {
    const isLinked = projectId ? isProjectLinked(projectId) : false;
    const linkedRepo = projectId ? getLinkedRepository(projectId) : null;

    return (
      <div className="flex-1 flex flex-col pt-16">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">No files imported yet</p>
          <p className="text-sm text-muted-foreground">
            Import from GitLab or import from a zip file to get started
          </p>
          <div className="flex gap-2">
            {isLinked && (
              <Button
                variant="outline"
                onClick={() => setShowSyncDialog(true)}
                className="mt-2"
              >
                <Download className="w-4 h-4 mr-2" />
                Import from GitLab
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowZipImportDialog(true)}
              className="mt-2"
            >
              <Package className="w-4 h-4 mr-2" />
              Import from Zip
            </Button>
          </div>
        </div>

        {/* Sync Dialog */}
        {projectId && isLinked && linkedRepo && (
          <GitLabSyncDialog
            open={showSyncDialog}
            onOpenChange={setShowSyncDialog}
            operationType="import"
            projectId={projectId}
            projectName={projectName}
            defaultBranch={linkedRepo.defaultBranch}
          />
        )}

        {/* Zip Import Dialog */}
        {projectId && (
          <ZipImportDialog
            open={showZipImportDialog}
            onOpenChange={setShowZipImportDialog}
            projectId={projectId}
            projectName={projectName}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-4 py-4 overflow-hidden min-h-0 min-w-0">
        {/* Sidebar - File Tree */}
        <div className="w-56 min-h-0 shrink-0">
          <StoryPanel className="h-full">
            <button
              className="w-full py-2 px-3 rounded text-sm font-medium mb-2 transition-colors"
              style={{ background: "var(--theme-color)", color: "white" }}
            >
              + New Chapter
            </button>

            <button
              onClick={() => setShowZipImportDialog(true)}
              className="w-full py-2 px-3 rounded text-sm font-medium mb-4 transition-colors border border-dashed hover:bg-muted/50 text-muted-foreground"
              type="button"
            >
              <Package className="w-4 h-4 mr-2 inline" />
              Import Zip
            </button>

            <ProjectFileTree
              files={projectFiles}
              activeFileId={activeFileId ?? undefined}
              activeSceneId={activeLabelId ?? undefined}
              onFileSelect={handleGitLabFileSelect}
              onSceneSelect={handleGitLabSceneSelect}
              initialExpandedFolders={initialExpandedFolders}
            />
          </StoryPanel>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {/* Tabs */}
          <div className="flex items-end mb-0">
            {activeProjectFile && (
              <BookmarkTab
                name={
                  activeProjectFile.filePath.split("/").pop() ||
                  activeProjectFile.filePath
                }
                isActive={true}
                onClick={() => {}}
              />
            )}
          </div>

          {/* Editor */}
          <div className="flex-1 !mt-0 min-h-0 min-w-0 overflow-hidden">
            <div className="bg-card/80 backdrop-blur border border-border/30 rounded-lg h-full overflow-hidden min-h-0 min-w-0">
              {activeProjectFile ? (
                <ScriptEditor
                  content={activeFileContent}
                  scrollToLine={scrollToLine}
                  onChange={(value) =>
                    console.log("GitLab file content changed:", value)
                  }
                />
              ) : activeLabel ? (
                <ScriptEditor
                  content={activeLabelPlainText}
                  onChange={(value) =>
                    // TODO: Implement content persistence for GitLab files
                    console.log("Label content changed:", value)
                  }
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a file or scene to view its content
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Character Reference */}
        <div className="w-64 min-h-0 shrink-0">
          <StoryPanel className="h-full">
            {characters.length > 0 ? (
              <div className="space-y-4">
                {characters.map((character) => (
                  <div
                    key={character.id}
                    className="text-center p-4 rounded-lg border border-dashed"
                    style={{ borderColor: "var(--theme-border-subtle)" }}
                  >
                    <div className="text-4xl mb-2">
                      {character.displayName[0] || "???"}
                    </div>
                    <p className="text-sm font-medium">
                      {character.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {character.role.toLowerCase()}
                    </p>
                    {character.emotion && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Emotion: {character.emotion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-4 text-muted-foreground">
                No characters in this scene
              </div>
            )}

            {/* Branching visualization */}
            <div
              className="mt-6 pt-4 border-t border-dashed"
              style={{ borderColor: "var(--theme-border-subtle)" }}
            >
              <p className="text-s font-display tracking-wider text-muted-foreground mb-3">
                Scene Info
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--theme-color)" }}
                  />
                  <span>Status: {activeLabel?.status ?? "Unknown"}</span>
                </div>
                {activeLabel?.routeKey && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                    <span>Route: {activeLabel.routeKey}</span>
                  </div>
                )}
                {activeLabel?.groupType && activeLabel?.groupValue && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                    <span>
                      {activeLabel.groupType}: {activeLabel.groupValue}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </StoryPanel>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        lineCount={
          activeProjectFile
            ? activeFileLines.length
            : activeLabel
              ? activeLabelLines.length
              : 0
        }
        language="Ren'Py"
        themeName={themeName}
        projectId={projectId}
        projectName={projectName}
        gitlabBranch={gitlabBranch}
      />

      {/* Zip Import Dialog (always available for non-empty projects too) */}
      {projectId && (
        <ZipImportDialog
          open={showZipImportDialog}
          onOpenChange={setShowZipImportDialog}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </div>
  );
}
