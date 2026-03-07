import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";

/**
 * GitLab File with associated scenes
 */
export interface GitLabFileScene {
  id: string;
  labelName: string | null;
  title: string;
}

export interface GitLabFileNode {
  id: string;
  filePath: string;
  fileType: "STORY" | "SETTINGS";
  content: string;
  lastSyncedAt: string | null;
  scenes: GitLabFileScene[];
}

interface GitLabFileTreeProps {
  files: GitLabFileNode[];
  activeFileId?: string;
  activeSceneId?: string;
  onFileSelect: (fileId: string) => void;
  onSceneSelect: (sceneId: string) => void;
  initialExpandedFolders?: string[];
}

/**
 * Group files by folder structure
 */
function groupFilesByFolder(files: GitLabFileNode[]): Map<string, GitLabFileNode[]> {
  const grouped = new Map<string, GitLabFileNode[]>();

  for (const file of files) {
    const parts = file.filePath.split("/");
    const folder = parts.length > 1 ? parts[0] : "";
    const existing = grouped.get(folder) || [];
    existing.push(file);
    grouped.set(folder, existing);
  }

  return grouped;
}

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

export function GitLabFileTree({
  files,
  activeFileId,
  activeSceneId,
  onFileSelect,
  onSceneSelect,
  initialExpandedFolders,
}: GitLabFileTreeProps) {
  // Track expanded folders and files
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(initialExpandedFolders ?? []),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  const toggleFile = (fileId: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const groupedFiles = groupFilesByFolder(files);

  return (
    <div className="space-y-1">
      <div
        className="text-s font-display tracking-wider text-muted-foreground mb-3 pb-2 border-b border-dashed"
        style={{ borderColor: "var(--theme-color)" }}
      >
        GitLab Files
      </div>

      {Array.from(groupedFiles.entries()).map(([folder, folderFiles]) => (
        <div key={folder} className="mb-2">
          {folder && (
            <button
              onClick={() => toggleFolder(folder)}
              className="w-full flex items-center gap-1 py-1 px-2 rounded text-sm text-foreground/70 hover:text-foreground hover:bg-muted/20 transition-all"
            >
              {expandedFolders.has(folder) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Folder className="w-3 h-3 mr-1" />
              <span className="font-medium">{folder}</span>
            </button>
          )}

          {(!folder || expandedFolders.has(folder)) && (
            <div className={folder ? "ml-4 space-y-1" : "space-y-1"}>
              {folderFiles.map((file) => (
                <div key={file.id}>
                  <button
                    onClick={() => {
                      onFileSelect(file.id);
                      if (file.fileType === "STORY" && file.scenes.length > 0) {
                        toggleFile(file.id);
                      }
                    }}
                    className={`w-full flex items-center gap-1 py-1 px-2 rounded text-sm transition-all ${
                      activeFileId === file.id
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                    }`}
                  >
                    {file.fileType === "STORY" && file.scenes.length > 0 ? (
                      expandedFiles.has(file.id) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )
                    ) : (
                      <File className="w-3 h-3 ml-2" />
                    )}
                    <span className="ml-1">{getFileName(file.filePath)}</span>
                    {file.fileType === "SETTINGS" && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Settings
                      </span>
                    )}
                  </button>

                  {/* Show scenes (labels) for STORY files */}
                  {file.fileType === "STORY" &&
                    expandedFiles.has(file.id) &&
                    file.scenes.length > 0 && (
                      <div className="ml-6 space-y-0.5 mt-0.5">
                        {file.scenes.map((scene) => (
                          <button
                            key={scene.id}
                            onClick={() => onSceneSelect(scene.id)}
                            className={`w-full flex items-center gap-1 py-0.5 px-2 rounded text-xs transition-all ${
                              activeSceneId === scene.id
                                ? "bg-muted/50 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                            }`}
                          >
                            <span className="ml-1">
                              {scene.labelName || scene.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {files.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No files imported yet
        </div>
      )}
    </div>
  );
}
