/**
 * Zip Import Guardrails
 *
 * Size and count limits for Ren'Py project zip imports.
 * Extracted from zip-import.service.ts to keep the import function focused.
 */

// ============================================================================
// Import Guardrails
// ============================================================================

export const MAX_ZIP_BUFFER_BYTES = 30 * 1024 * 1024; // 30MB compressed upload
export const MAX_EXTRACTED_BYTES = 120 * 1024 * 1024; // 120MB total extracted RPY content
export const MAX_RPY_FILES = 500; // Well above typical Ren'Py project sizes (large projects rarely exceed 200-300 files)
export const MAX_SINGLE_RPY_BYTES = 5 * 1024 * 1024; // 5MB per single RPY file

/**
 * Error thrown when a zip import exceeds one of the guardrail limits.
 * Caught by the importer to produce a safe, client-friendly error message.
 */
export class ZipImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipImportLimitError";
  }
}
