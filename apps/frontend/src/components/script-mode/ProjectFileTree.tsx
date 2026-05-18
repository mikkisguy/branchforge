import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import type { ProjectFileNode } from "@/hooks/useProjectFiles";
import type { LabelStatus } from "@branchforge/shared";

const STATUS_COLORS: Record<LabelStatus, string> = {
  FINAL: "var(--theme-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
};

interface ProjectFileTreeProps {
  files: ProjectFileNode[];
  activeFileId?: string;
  activeSceneId?: string;
  onFileSelect: (fileId: string) => void;
  onSceneSelect: (sceneId: string) => void;
  initialExpandedFolders?: string[];
  initialExpandedFiles?: string[];
}

/**
 * Group files by folder structure
 */
function groupFilesByFolder(
  files: ProjectFileNode[]
): Map<string, ProjectFileNode[]> {
  const grouped = new Map<string, ProjectFileNode[]>();

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

export function ProjectFileTree({
  files,
  activeFileId,
  activeSceneId,
  onFileSelect,
  onSceneSelect,
  initialExpandedFolders,
  initialExpandedFiles,
}: ProjectFileTreeProps) {
  // Track expanded folders and files
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(initialExpandedFolders ?? [])
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(initialExpandedFiles ?? [])
  );

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

  const groupedFiles = useMemo(() => groupFilesByFolder(files), [files]);

  return (
    <div className="space-y-2" role="tree">
      {Array.from(groupedFiles.entries()).map(([folder, folderFiles]) => (
        <div key={folder} className="mb-2">
          {folder && (
            <button
              onClick={() => toggleFolder(folder)}
              role="treeitem"
              aria-expanded={expandedFolders.has(folder)}
              aria-level={1}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              {expandedFolders.has(folder) ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{folder}</span>
            </button>
          )}

          {(!folder || expandedFolders.has(folder)) && (
            <div className="space-y-0.5" role="group">
              {folderFiles.map((file) => (
                <div key={file.id}>
                  <div
                    role="treeitem"
                    aria-expanded={
                      file.fileType === "STORY" && file.labels.length > 0
                        ? expandedFiles.has(file.id)
                        : undefined
                    }
                    aria-level={folder ? 2 : 1}
                    className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-md text-sm transition-colors ${
                      activeFileId === file.id
                        ? "bg-[var(--theme-color)]/10 text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                    }`}
                  >
                    {file.fileType === "STORY" && file.labels.length > 0 ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFile(file.id);
                        }}
                        className="flex items-center rounded p-0.5 hover:bg-muted/30"
                        aria-label="Toggle labels"
                        tabIndex={-1}
                      >
                        {expandedFiles.has(file.id) ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronRight className="size-3" />
                        )}
                      </button>
                    ) : (
                      <span className="w-3" />
                    )}
                    <button
                      onClick={() => onFileSelect(file.id)}
                      className="flex-1 text-left flex items-center gap-2 py-0.5 px-1 -my-0.5 rounded transition-colors"
                    >
                      <span className="truncate" title={file.filePath}>
                        {getFileName(file.filePath)}
                      </span>
                      {file.fileType === "SETTINGS" && (
                        <span className="text-[10px] text-muted-foreground/80 ml-auto shrink-0">
                          Settings
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Show labels for STORY files */}
                  {file.fileType === "STORY" &&
                    expandedFiles.has(file.id) &&
                    file.labels.length > 0 && (
                      <div className="pl-7 space-y-0.5" role="group">
                        {file.labels.map((label) => {
                          const safeStatus =
                            typeof label.status === "string" &&
                            label.status in STATUS_COLORS
                              ? (label.status as LabelStatus)
                              : "DRAFT";
                          const statusColor = STATUS_COLORS[safeStatus];

                          return (
                            <button
                              key={label.id}
                              onClick={() => onSceneSelect(label.id)}
                              role="treeitem"
                              aria-level={folder ? 3 : 2}
                              className={`w-full flex items-center gap-2 py-1 px-2 rounded-md text-xs transition-colors ${
                                activeSceneId === label.id
                                  ? "bg-[var(--theme-color)]/8 text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <span
                                className="size-1.5 rounded-full shrink-0 ring-[1.5px] ring-background"
                                style={{
                                  backgroundColor: statusColor,
                                }}
                                title={`Status: ${safeStatus}`}
                              />
                              <span className="truncate">
                                {label.labelName || label.title}
                              </span>
                            </button>
                          );
                        })}
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
