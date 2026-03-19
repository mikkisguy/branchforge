/**
 * Image Processing Service
 *
 * Handles validation and processing of avatar image uploads.
 * Converts images to WebP format, resizes to max width, and validates file size.
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AVATAR_MAX_WIDTH,
  AVATAR_UPLOAD_DIR,
  AVATAR_WEBP_QUALITY,
} from "../lib/storage.js";
import { ValidationError } from "../middleware/error-handler.middleware.js";
import crypto from "node:crypto";
import { AVATAR_MAX_SIZE, isValidAvatarMimeType } from "@branchforge/shared";
import { logError, logSecurityEvent, LogEventType } from "../lib/logger.js";

export interface ProcessAvatarOptions {
  maxWidth: number;
  quality: number;
  maxFileSize: number;
}

export interface ProcessAvatarResult {
  filename: string;
  buffer: Buffer;
}

/**
 * Validate and process an avatar image file
 *
 * @param file - The image file buffer
 * @param mimeType - The MIME type of the file
 * @param options - Processing options
 * @returns The processed image result with filename and buffer
 * @throws ValidationError if file is invalid
 */
export async function validateAndProcessAvatar(
  file: Buffer,
  mimeType: string,
  options: ProcessAvatarOptions = {
    maxWidth: AVATAR_MAX_WIDTH,
    quality: AVATAR_WEBP_QUALITY,
    maxFileSize: AVATAR_MAX_SIZE,
  }
): Promise<ProcessAvatarResult> {
  // Validate MIME type (using shared constants to keep frontend and backend in sync)
  if (!isValidAvatarMimeType(mimeType)) {
    throw new ValidationError(
      `Invalid image format. Accepted formats: PNG, JPEG, WebP, GIF`
    );
  }

  // Validate file size
  if (file.length > options.maxFileSize) {
    const maxSizeKB = Math.round(options.maxFileSize / 1024);
    throw new ValidationError(`Image must be smaller than ${maxSizeKB}KB`);
  }

  try {
    // Process image with sharp
    const image = sharp(file);

    // Get metadata for validation
    const metadata = await image.metadata();

    // Validate that it's actually a valid image
    if (!metadata.width || !metadata.height) {
      throw new ValidationError("Invalid image file");
    }

    // Resize if necessary (max width, maintain aspect ratio)
    const processedImage = image.resize(options.maxWidth, null, {
      withoutEnlargement: true,
    });

    // Convert to WebP
    const webpImage = processedImage.webp({ quality: options.quality });

    // Get the processed buffer
    const buffer = await webpImage.toBuffer();

    // Generate unique filename
    const filename = `${crypto.randomUUID()}.webp`;

    return { filename, buffer };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    // Log original error with structured metadata
    logError(
      LogEventType.IMAGE_PROCESSING_FAILURE,
      {
        fileSize: file.length,
        mimeType,
        maxWidth: options.maxWidth,
        quality: options.quality,
      },
      error
    );

    // Convert sharp errors to ValidationError
    throw new ValidationError("Invalid image file");
  }
}

/**
 * Delete an avatar file from disk
 *
 * @param filePath - The full path to the avatar file (must be within AVATAR_UPLOAD_DIR)
 * @throws Error if filePath is outside the avatar upload directory
 */
export async function deleteAvatar(filePath: string): Promise<void> {
  // Validate that the path is within the avatar uploads directory
  // to prevent unauthorized file deletion (path traversal attacks)
  const avatarUploadDir = path.resolve(process.cwd(), AVATAR_UPLOAD_DIR);
  const resolvedPath = path.resolve(filePath);

  // Ensure the resolved path is within the avatar directory
  if (!resolvedPath.startsWith(avatarUploadDir + path.sep)) {
    // Sanitize path for logging (don't log full path in case it contains sensitive info)
    const sanitizedPath = path.basename(filePath);

    logSecurityEvent(LogEventType.SECURITY_PATH_TRAVERSAL, {
      suspectedPathTraversal: true,
      filePath: sanitizedPath,
      avatarUploadDir: AVATAR_UPLOAD_DIR,
    });

    throw new Error("Invalid avatar path");
  }

  try {
    await fs.unlink(resolvedPath);
  } catch (error: unknown) {
    // Ignore file not found errors - avatar may already be deleted
    // Re-throw other errors (e.g., permission denied)
    if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
  }
}
