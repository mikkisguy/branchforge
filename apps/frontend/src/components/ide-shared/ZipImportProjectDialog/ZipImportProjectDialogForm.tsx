/**
 * Zip Import Project Dialog - Form Step
 *
 * The project details form and file upload zone for creating a new project from a ZIP.
 */

import { Upload, FileArchive, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize } from "@/lib/utils";
import { ZIP_IMPORT_MAX_SIZE_MB } from "@branchforge/shared";
import type { ZipImportAction } from "./ZipImportProjectDialogReducer";

interface ZipImportProjectDialogFormProps {
  projectName: string;
  projectDescription: string;
  selectedFile: File | null;
  dispatch: React.Dispatch<ZipImportAction>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onImport: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ZipImportProjectDialogForm({
  projectName,
  projectDescription,
  selectedFile,
  dispatch,
  onFileChange,
  onDrop,
  onDragOver,
  onImport,
  fileInputRef,
}: ZipImportProjectDialogFormProps) {
  return (
    <>
      {/* Project details */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="zip-project-name">Project name *</Label>
          <Input
            id="zip-project-name"
            value={projectName}
            onChange={(e) =>
              dispatch({
                type: "SET_PROJECT_NAME",
                value: e.target.value,
              })
            }
            placeholder="My Visual Novel"
            maxLength={200}
            aria-required="true"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zip-project-description">Description</Label>
          <Textarea
            id="zip-project-description"
            value={projectDescription}
            onChange={(e) =>
              dispatch({
                type: "SET_PROJECT_DESCRIPTION",
                value: e.target.value,
              })
            }
            placeholder="Optional description"
            maxLength={2000}
            rows={2}
            className="resize-y"
          />
        </div>
      </div>

      {/* File upload */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${
            selectedFile
              ? "border-primary bg-primary/5"
              : "border-border/50 hover:border-border hover:bg-muted/50"
          }
        `}
      >
        {selectedFile ? (
          <div className="space-y-3">
            <FileArchive className="size-12 mx-auto text-primary" />
            <p className="font-medium">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "SET_SELECTED_FILE", file: null });
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="size-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Drop zip file here</p>
              <p className="text-sm text-muted-foreground">or</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={onFileChange}
              className="hidden"
              aria-label="Upload project zip file"
            />
            <p className="text-xs text-muted-foreground">
              Maximum file size: {ZIP_IMPORT_MAX_SIZE_MB}MB
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-200">
        <ul className="space-y-1.5 list-disc list-inside">
          <li>Include your script files (.rpy)</li>
          <li>Exclude media like image/audio folders</li>
          <li>Maximum file size: {ZIP_IMPORT_MAX_SIZE_MB}MB</li>
        </ul>
      </div>

      {/* Import button */}
      <Button
        type="button"
        onClick={onImport}
        disabled={!selectedFile || !projectName.trim()}
        className="w-full"
      >
        <Package className="mr-2 size-4" />
        Import Project
      </Button>
    </>
  );
}
