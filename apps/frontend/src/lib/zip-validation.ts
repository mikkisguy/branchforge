/**
 * ZIP File Validation Utilities
 *
 * Shared validation logic for ZIP file uploads across the application.
 */

import {
  ZIP_IMPORT_MAX_SIZE,
  ZIP_IMPORT_MAX_SIZE_MB,
} from "@branchforge/shared";

/**
 * Validate a ZIP file for upload.
 *
 * @param file - The file to validate
 * @returns The file if valid, or an error message string if invalid
 */
export function validateZipFile(file: File): File | string {
  // Validate file extension
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return "Please select a .zip file";
  }

  // Validate file size (must match backend limit)
  if (file.size > ZIP_IMPORT_MAX_SIZE) {
    return `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`;
  }

  return file;
}
