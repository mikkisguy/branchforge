import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder, FileCode } from "lucide-react";
import type { ProjectFileNode } from "@/hooks/useProjectFiles";
import type {
  GeneratedExportPreviewFile,
  LabelStatus,
} from "@branchforge/shared";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import { Tooltip } from "@/components/ui/tooltip";

const STATUS_COLORS: Record<LabelStatus, string> = {
  FINAL: "var(--theme-final-color)",
  REVIEW: "var(--theme-review-color)",
  DRAFT: "var(--theme-draft-color)",
};

export type GeneratedFileInfo = Pick<
  GeneratedExportPreviewFile,
  "fileName" | "isEmpty" | "emptyReason"
>;

interface ProjectFileTreeProps {
  files: ProjectFileNode[];
  activeFileId?: string;
  activeSceneId?: string;
  onFileSelect: (fileId: string) => void;
  onSceneSelect: (sceneId: string) => void;
  initialExpandedFolders?: string[];
  initialExpandedFiles?: string[];
  generatedFiles?: GeneratedFileInfo[];
  activeGeneratedFileId?: string | null;
  onGeneratedFileSelect?: (fileName: string) => void;
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
  generatedFiles,
  activeGeneratedFileId,
  onGeneratedFileSelect,
}: ProjectFileTreeProps) {
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
      {generatedFiles && generatedFiles.length > 0 && (
        <CollapsibleSection title="Generated">
          <div className="space-y-0.5" role="group">
            {generatedFiles.map((file) => {
              const isSelected = activeGeneratedFileId === file.fileName;
              // Use aria-disabled (not disabled) so Tooltip hover/focus still works.
              const btn = (
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-level={1}
                  aria-disabled={file.isEmpty}
                  onClick={() => {
                    if (file.isEmpty || !onGeneratedFileSelect) return;
                    onGeneratedFileSelect(file.fileName);
                  }}
                  className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-md text-sm text-left transition-colors italic opacity-70 ${
                    isSelected
                      ? "bg-[var(--theme-color)]/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                  } ${file.isEmpty ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <FileCode className="size-3.5 shrink-0" />
                  <span className="truncate">{file.fileName}</span>
                  {file.isEmpty && (
                    <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                      empty
                    </span>
                  )}
                </button>
              );

              return file.isEmpty && file.emptyReason ? (
                <Tooltip key={file.fileName} content={file.emptyReason}>
                  {btn}
                </Tooltip>
              ) : (
                <div key={file.fileName}>{btn}</div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {Array.from(groupedFiles.entries()).map(([folder, folderFiles]) => (
        <div key={folder} className="mb-2">
          {folder && (
            <button
              type="button"
              onClick={() => toggleFolder(folder)}
              // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
              role="treeitem"
              aria-expanded={expandedFolders.has(folder)}
              aria-level={1}
              aria-owns={
                expandedFolders.has(folder)
                  ? `folder-group-${folder.replace(/[^a-zA-Z0-9-_]/g, "-")}`
                  : undefined
              }
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
            // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
            <div
              className="space-y-0.5"
              role="group"
              id={
                folder
                  ? `folder-group-${folder.replace(/[^a-zA-Z0-9-_]/g, "-")}`
                  : undefined
              }
            >
              {folderFiles.map((file) => (
                <div key={file.id}>
                  <div className="flex items-center gap-0.5">
                    {file.fileType === "STORY" && file.labels.length > 0 ? (
                      <span
                        aria-hidden="true"
                        className="flex items-center justify-center size-5"
                      >
                        {expandedFiles.has(file.id) ? (
                          <ChevronDown className="size-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3 text-muted-foreground" />
                        )}
                      </span>
                    ) : (
                      <span className="w-5" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          file.fileType === "STORY" &&
                          file.labels.length > 0
                        ) {
                          toggleFile(file.id);
                        } else {
                          onFileSelect(file.id);
                        }
                      }}
                      role="treeitem"
                      aria-selected={activeFileId === file.id}
                      aria-expanded={
                        file.fileType === "STORY" && file.labels.length > 0
                          ? expandedFiles.has(file.id)
                          : undefined
                      }
                      aria-level={folder ? 2 : 1}
                      aria-owns={
                        file.fileType === "STORY" &&
                        file.labels.length > 0 &&
                        expandedFiles.has(file.id)
                          ? `label-group-${file.id}`
                          : undefined
                      }
                      className={`flex-1 flex items-center gap-2 py-1.5 px-2 rounded-md text-sm text-left transition-colors ${
                        activeFileId === file.id
                          ? "bg-[var(--theme-color)]/10 text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                      }`}
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
                      // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
                      <div
                        className="pl-7 space-y-0.5"
                        role="group"
                        id={`label-group-${file.id}`}
                      >
                        {file.labels.map((label) => {
                          const safeStatus =
                            typeof label.status === "string" &&
                            label.status in STATUS_COLORS
                              ? (label.status as LabelStatus)
                              : "DRAFT";
                          const statusColor = STATUS_COLORS[safeStatus];

                          return (
                            <button
                              type="button"
                              key={label.id}
                              onClick={() => onSceneSelect(label.id)}
                              role="treeitem"
                              aria-selected={activeSceneId === label.id}
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
