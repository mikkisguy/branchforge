/**
 * Project Files API Client
 *
 * Client for project file operations (GitLab, zip, etc.).
 * Handles file listing, content retrieval, updates, and zip import.
 */

import { request } from "./client.js";
import type { ProjectFile } from "@branchforge/shared";
import { FileSourceType, isValidFileSourceType } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface ProjectFileNode extends ProjectFile {
  labels: Array<{
    id: string;
    labelName: string | null;
    title: string;
  }>;
}

export interface ImportZipResponse {
  success: boolean;
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  labelsCreated: number;
  error?: string;
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
    options?: { source?: FileSourceType }
  ): Promise<ProjectFileNode[]> {
    validateRequired(projectId, "Project ID");

    const searchParams = new URLSearchParams();
    if (options?.source) {
      if (!isValidFileSourceType(options.source)) {
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
    source: FileSourceType
  ): Promise<ProjectFile> {
    validateRequired(projectId, "Project ID");
    validateRequired(filePath, "File path");

    if (!isValidFileSourceType(source)) {
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

    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

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
              const error = JSON.parse(xhr.responseText) as { error: string };
              reject(new Error(error.error || "Upload failed"));
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
      const error: { error: string } = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        error.error || `Request failed with status ${response.status}`
      );
    }

    return response.json();
  },
};
