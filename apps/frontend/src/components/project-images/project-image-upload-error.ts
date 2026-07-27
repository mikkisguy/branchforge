/**
 * Shared upload error helper for project image uploads.
 *
 * Parameterized by conflict-hint text so each caller can provide
 * the appropriate user-facing instructions for 409 conflicts.
 */

import { ApiRequestError } from "@/lib/api/client";

export function getProjectImageUploadErrorMessage(
  error: unknown,
  target: string,
  conflictHint: string
): string {
  if (error instanceof ApiRequestError && error.status === 409) {
    return `An image for "${target}" already exists. ${conflictHint}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Upload failed.";
}
