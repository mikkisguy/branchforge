import { useState, useMemo, useEffect } from "react";
import { Download } from "lucide-react";
import { StoryPanel } from "@/components/ide-shared";
import {
  FileTree,
  BookmarkTab,
  StatusBar,
  ScriptEditor,
} from "@/components/script-mode";
import { GitLabFileTree } from "@/components/script-mode/GitLabFileTree";
import { useScenes } from "@/hooks/useScenes";
import { useGitLab } from "@/hooks/useGitLab";
import { useGitLabFiles } from "@/hooks/useGitLabFiles";
import { generateRpyContent, generateFileTree } from "@/lib/rpy-generator";
import { GitLabSyncDialog } from "@/components/script-mode/GitLabSyncDialog";
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
  const {
    scenes,
    activeScene,
    activeSceneId,
    setActiveSceneId,
    isLoadingScenes,
  } = useScenes();

  const { isProjectLinked, getLinkedRepository } = useGitLab();
  const { files: gitLabFiles, isLoadingFiles } = useGitLabFiles(projectId);

  // Sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  // Track active file for Script Mode
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const activeGitLabFile = useMemo(
    () => gitLabFiles.find((f) => f.id === activeFileId) || null,
    [gitLabFiles, activeFileId],
  );

  // Generate file tree from scenes
  const { flatFiles: files, fileNameToSceneId } = useMemo(() => {
    const fileTree = generateFileTree(scenes);

    // Build flat file list with folder separators and scene ID mapping
    const flatFiles: { name: string; type: "file" | "folder" }[] = [];
    const fileNameToSceneId = new Map<string, string>();

    for (const folder of fileTree) {
      flatFiles.push({ name: folder.name, type: "folder" });
      for (const file of folder.children || []) {
        flatFiles.push({ name: file.name, type: "file" });
        if (file.sceneId) {
          fileNameToSceneId.set(file.name, file.sceneId);
        }
      }
    }

    return { flatFiles, fileNameToSceneId };
  }, [scenes]);

  // Generate RPY content for active scene
  const activeSceneContent = useMemo(() => {
    if (!activeScene) return [];
    return generateRpyContent(activeScene);
  }, [activeScene]);

  // Get active file content directly for Script Mode editing
  const activeFileContent = activeGitLabFile?.content || "";
  // Memoize file lines to avoid repeated split operations
  const activeFileLines = useMemo(
    () => activeFileContent.split("\n"),
    [activeFileContent],
  );

  // Track active file (scene) - for non-GitLab scenes
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Sync active file with active scene ID
  useEffect(() => {
    if (activeSceneId) {
      const fileEntry = Array.from(fileNameToSceneId.entries()).find(
        ([, sceneId]) => sceneId === activeSceneId,
      );
      if (fileEntry) {
        setActiveFile(fileEntry[0]);
      }
    } else {
      setActiveFile(null);
    }
  }, [activeSceneId, fileNameToSceneId]);

  // Handle file selection (matches FileTree's onSelectFile signature)
  const handleFileSelect = (fileName: string) => {
    const sceneId = fileNameToSceneId.get(fileName);
    if (sceneId) {
      setActiveSceneId(sceneId);
    }
  };

  // Handle GitLab file selection
  const handleGitLabFileSelect = (fileId: string) => {
    setActiveFileId(fileId);
    // Also clear the active scene since we're now in file mode
    setActiveSceneId(null);
  };

  // Handle GitLab scene selection (label within a file)
  const handleGitLabSceneSelect = (sceneId: string) => {
    setActiveSceneId(sceneId);
  };

  // Character panel data
  const characters = useMemo(() => {
    return activeScene?.characters ?? [];
  }, [activeScene]);

  // Loading state
  if (isLoadingScenes || isLoadingFiles) {
    return (
      <div className="flex-1 flex flex-col pt-16">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading scenes...</p>
        </div>
      </div>
    );
  }

  // No scenes state
  if (!scenes.length && !gitLabFiles.length) {
    const isLinked = projectId ? isProjectLinked(projectId) : false;
    const linkedRepo = projectId ? getLinkedRepository(projectId) : null;

    return (
      <div className="flex-1 flex flex-col pt-16">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">
            No scenes found in this project
          </p>
          <p className="text-sm text-muted-foreground">
            Create scenes in Write Mode or import from GitLab
          </p>
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
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pt-16">
      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-8 pb-4 overflow-visible">
        {/* Sidebar - File Tree */}
        <div className="w-56">
          <StoryPanel className="h-full">
            <button
              className="w-full py-2 px-3 rounded text-sm font-medium mb-4 transition-colors"
              style={{ background: "var(--theme-color)", color: "white" }}
            >
              + New Chapter
            </button>

            {gitLabFiles.length > 0 ? (
              <GitLabFileTree
                files={gitLabFiles}
                activeFileId={activeFileId ?? undefined}
                activeSceneId={activeSceneId ?? undefined}
                onFileSelect={handleGitLabFileSelect}
                onSceneSelect={handleGitLabSceneSelect}
              />
            ) : (
              <FileTree
                files={files}
                activeFile={activeFile ?? ""}
                onSelectFile={handleFileSelect}
              />
            )}
          </StoryPanel>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className="flex items-end mb-0">
            {activeGitLabFile && (
              <BookmarkTab
                name={
                  activeGitLabFile.filePath.split("/").pop() ||
                  activeGitLabFile.filePath
                }
                isActive={true}
                onClick={() => {}}
              />
            )}
            {!activeGitLabFile && activeFile && (
              <BookmarkTab
                name={activeFile}
                isActive={true}
                onClick={() => {}}
              />
            )}
          </div>

          {/* Editor */}
          <StoryPanel className="flex-1 !mt-0">
            {activeGitLabFile ? (
              <ScriptEditor
                content={activeFileLines}
                language="Ren'Py"
              />
            ) : activeScene ? (
              <ScriptEditor content={activeSceneContent} language="Ren'Py" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {gitLabFiles.length > 0
                  ? "Select a file or scene to view its content"
                  : "Select a scene to view its content"}
              </div>
            )}
          </StoryPanel>
        </div>

        {/* Right Panel - Character Reference */}
        <div className="w-64">
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
                  <span>Status: {activeScene?.status ?? "Unknown"}</span>
                </div>
                {activeScene?.routeKey && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                    <span>Route: {activeScene.routeKey}</span>
                  </div>
                )}
                {activeScene?.groupType && activeScene?.groupValue && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                    <span>{activeScene.groupType}: {activeScene.groupValue}</span>
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
          activeGitLabFile
            ? activeFileLines.length
            : activeScene
              ? activeSceneContent.length || 0
              : 0
        }
        language="Ren'Py"
        themeName={themeName}
        projectId={projectId}
        projectName={projectName}
        gitlabBranch={gitlabBranch}
      />
    </div>
  );
}

