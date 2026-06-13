/**
 * Project Files API Client
 *
 * Client for project file operations (GitLab, zip, etc.).
 * Handles file listing, content retrieval, updates, and zip import.
 */

import { API_BASE, request, getApiErrorMessage } from "./client.js";
import type { ProjectFile, ImportZipResponse } from "@branchforge/shared";
import type { SourceOrigin } from "@branchforge/shared";
import { isValidSourceOrigin } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface ProjectFileNode extends ProjectFile {
  labels: Array<{
    id: string;
    labelName: string | null;
    title: string;
    status: string | null;
  }>;
}

export type UpdateFileResponse =
  | {
      success: true;
      contentHash: string;
      updatedAt: string;
    }
  | {
      success: false;
      conflict: {
        reason: "STALE_CONTENT_HASH";
        currentContentHash: string;
      };
    };

export interface ExportSummary {
  id: string;
  projectId: string;
  format: string;
  fileName: string;
  fileSize: number | null;
  createdAt: string;
}

export interface GenerateExportResponse {
  id: string;
  fileName: string;
  fileSize: number;
  format: string;
  createdAt: string;
}

// ============================================================================
// Validation Utilities
// ============================================================================

const VALIDATION_ERRORS = {
  PROJECT_ID_REQUIRED: "Project ID is required",
  FILE_PATH_REQUIRED: "File path is required",
  SOURCE_REQUIRED: "Source is required",
  FILE_ID_REQUIRED: "File ID is required",
  FILE_REQUIRED: "File is required",
  INVALID_SOURCE: "Invalid source type",
} as const;

/**
 * Maps field names to their corresponding validation error messages.
 */
const FIELD_ERROR_MAP: Record<string, string> = {
  "Project ID": VALIDATION_ERRORS.PROJECT_ID_REQUIRED,
  "File path": VALIDATION_ERRORS.FILE_PATH_REQUIRED,
  Source: VALIDATION_ERRORS.SOURCE_REQUIRED,
  "File ID": VALIDATION_ERRORS.FILE_ID_REQUIRED,
};

/**
 * Validates required string field using centralized error messages.
 */
function validateRequired(value: string, fieldName: string): void {
  if (!value || value.trim() === "") {
    const errorMessage =
      FIELD_ERROR_MAP[fieldName] || `${fieldName} is required`;
    throw new Error(errorMessage);
  }
}

// ============================================================================
// Project Files API Methods
// ============================================================================

export const projectFilesApi = {
  /**
   * List all project files for a project, optionally filtered by source
   */
  async listFiles(
    projectId: string,
    options?: { source?: SourceOrigin }
  ): Promise<ProjectFileNode[]> {
    validateRequired(projectId, "Project ID");

    const searchParams = new URLSearchParams();
    if (options?.source) {
      if (!isValidSourceOrigin(options.source)) {
        throw new Error(VALIDATION_ERRORS.INVALID_SOURCE);
      }
      searchParams.append("source", options.source);
    }

    const query = searchParams.toString();
    const endpoint = `/projects/${projectId}/files${query ? `?${query}` : ""}`;

    const response = await request<{ files: ProjectFileNode[] }>(endpoint);
    return response.files;
  },

  /**
   * Get a specific file by path and source
   */
  async getFile(
    projectId: string,
    filePath: string,
    source: SourceOrigin
  ): Promise<ProjectFile> {
    validateRequired(projectId, "Project ID");
    validateRequired(filePath, "File path");

    if (!isValidSourceOrigin(source)) {
      throw new Error(VALIDATION_ERRORS.INVALID_SOURCE);
    }

    return request<ProjectFile>(
      `/projects/${projectId}/files/file?path=${encodeURIComponent(
        filePath
      )}&source=${source}`
    );
  },

  /**
   * Update file content
   */
  async updateFile(
    fileId: string,
    content: string,
    options?: { expectedContentHash?: string }
  ): Promise<UpdateFileResponse> {
    validateRequired(fileId, "File ID");

    return request<UpdateFileResponse>(
      `/projects/files/${fileId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          content,
          expectedContentHash: options?.expectedContentHash,
        }),
      },
      true // allow 409 Conflict responses (STALE_CONTENT_HASH) to be returned instead of thrown
    );
  },

  /**
   * Import a Ren'Py project from a zip file
   */
  async importZip(
    projectId: string,
    file: File,
    options?: {
      onProgress?: (loaded: number, total: number) => void;
      signal?: AbortSignal;
    }
  ): Promise<ImportZipResponse> {
    validateRequired(projectId, "Project ID");

    if (!file) {
      throw new Error(VALIDATION_ERRORS.FILE_REQUIRED);
    }

    // Validate file extension
    if (!file.name.toLowerCase().endsWith(".zip")) {
      throw new Error("File must be a .zip file");
    }

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append("file", file);

    // Use XMLHttpRequest for upload progress if callback provided
    if (options?.onProgress) {
      return new Promise<ImportZipResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Handle abort signal if provided
        if (options.signal) {
          // Check if already aborted
          if (options.signal.aborted) {
            reject(new Error("Upload was cancelled"));
            return;
          }

          const abortHandler = () => {
            xhr.abort();
          };

          options.signal.addEventListener("abort", abortHandler);

          // Clean up signal listener on xhr completion
          const cleanupSignal = () => {
            options.signal!.removeEventListener("abort", abortHandler);
          };

          xhr.addEventListener("load", cleanupSignal);
          xhr.addEventListener("error", cleanupSignal);
          xhr.addEventListener("abort", cleanupSignal);
        }

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            options.onProgress!(e.loaded, e.total);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(
                xhr.responseText
              ) as ImportZipResponse;
              resolve(response);
            } catch {
              reject(new Error("Failed to parse response"));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText) as {
                error?: string;
                message?: string;
                statusCode?: number;
              };
              reject(new Error(getApiErrorMessage(error, xhr.status)));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload was cancelled"));
        });

        xhr.open("POST", `${API_BASE}/projects/${projectId}/import/zip`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });
    }

    // Without progress tracking, use fetch (through request)
    const url = `${API_BASE}/projects/${projectId}/import/zip`;

    // Check if already aborted
    if (options?.signal?.aborted) {
      throw new Error("Upload was cancelled");
    }

    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok) {
      const error: { error?: string; message?: string; statusCode?: number } =
        await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(getApiErrorMessage(error, response.status));
    }

    return response.json();
  },

  /**
   * List export history for a project
   */
  async listExports(projectId: string): Promise<ExportSummary[]> {
    validateRequired(projectId, "Project ID");

    const response = await request<{ exports: ExportSummary[] }>(
      `/projects/${projectId}/exports`
    );
    return response.exports;
  },

  /**
   * Generate a new zip export for a project.
   * Returns the export metadata including the download ID.
   */
  async generateExport(projectId: string): Promise<GenerateExportResponse> {
    validateRequired(projectId, "Project ID");

    return request<GenerateExportResponse>(
      "/projects/" + projectId + "/export",
      {
        method: "POST",
      }
    );
  },

  /**
   * Download a generated export as a zip file.
   * Triggers a browser download of the zip.
   */
  async downloadExport(projectId: string, exportId: string): Promise<void> {
    validateRequired(projectId, "Project ID");
    validateRequired(exportId, "Export ID");

    const url = `${API_BASE}/projects/${projectId}/exports/${exportId}/download`;
    const response = await fetch(url, { credentials: "include" });

    if (!response.ok) {
      const errorData: { error?: string; message?: string } = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(getApiErrorMessage(errorData, response.status));
    }

    // Extract filename from Content-Disposition header
    const disposition = response.headers.get("Content-Disposition");
    let fileName = "export.zip";
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match?.[1]) {
        fileName = match[1];
      }
    }

    // Trigger browser download
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  },
};
