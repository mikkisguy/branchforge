/**
 * Project image preview types and matching helpers.
 *
 * Used to auto-link uploaded preview images to Ren'Py visual statements
 * (scene / show / hide) by filename.
 */

/** MIME types accepted for project preview image uploads */
export const PROJECT_IMAGE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

/** Max original upload size before client-side resize (5MB) */
export const PROJECT_IMAGE_MAX_SIZE_MB = 5;
export const PROJECT_IMAGE_MAX_SIZE = PROJECT_IMAGE_MAX_SIZE_MB * 1024 * 1024;

/** Max length for the stored originalFilename */
export const PROJECT_IMAGE_ORIGINAL_FILENAME_MAX = 255;

/** Preview sizes produced client-side before upload */
export const PROJECT_IMAGE_TOOLTIP_SIZE = 200;
export const PROJECT_IMAGE_MODAL_SIZE = 800;

export function isValidProjectImageMimeType(mimeType: string): boolean {
  return PROJECT_IMAGE_ALLOWED_MIME_TYPES.includes(
    mimeType.toLowerCase() as (typeof PROJECT_IMAGE_ALLOWED_MIME_TYPES)[number]
  );
}

/**
 * Public project image DTO (URLs are absolute app paths for static serving).
 */
export interface ProjectImage {
  id: string;
  projectId: string;
  originalFilename: string;
  /** Underscore-form target used for matching, unique per project */
  normalizedTarget: string;
  tooltipUrl: string;
  modalUrl: string;
  createdAt: string;
}

/**
 * Normalize a filename or statement target into the stored match key.
 *
 * - Strips a single trailing image extension when present
 * - Trims whitespace
 * - Collapses internal whitespace runs to single underscores
 * - Lowercases for case-insensitive uniqueness / matching
 *
 * @example
 * normalizeImageTarget("Eileen Happy.png") // "eileen_happy"
 * normalizeImageTarget("example_123.webp") // "example_123"
 * normalizeImageTarget("eileen happy") // "eileen_happy"
 */
export function normalizeImageTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const withoutExt = trimmed.replace(/\.(png|jpe?g|webp|gif|bmp)$/i, "");

  return withoutExt
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Compare a visual statement target to a stored normalized_target.
 *
 * Matching is case-insensitive and treats underscores and spaces as equivalent.
 * Statement targets should already exclude trailing `at` / `with` / `as` clauses
 * (those are separate fields on VisualStatement).
 *
 * @example
 * visualTargetsMatch("eileen happy", "eileen_happy") // true
 * visualTargetsMatch("example_123", "example_123") // true
 * visualTargetsMatch("Eileen Happy", "eileen_happy") // true
 */
export function visualTargetsMatch(
  statementTarget: string,
  normalizedTarget: string
): boolean {
  const left = normalizeImageTarget(statementTarget);
  const right = normalizeImageTarget(normalizedTarget);
  return left.length > 0 && left === right;
}

/**
 * Find the first project image that matches a visual statement target.
 */
export function findProjectImageForTarget<
  T extends { normalizedTarget: string },
>(images: readonly T[], statementTarget: string): T | undefined {
  return images.find((image) =>
    visualTargetsMatch(statementTarget, image.normalizedTarget)
  );
}
