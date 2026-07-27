/**
 * Project Images Service
 *
 * CRUD for visual preview images linked to Ren'Py statement targets.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { eq, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { projectImages, projects } from "../db/schema/index.js";
import type { ProjectImageRow } from "../db/schema/index.js";
import {
  requireProjectAccess,
  requireProjectOwnership,
} from "./authz.service.js";
import {
  ensureProjectImageDir,
  generateProjectImageFilename,
  getProjectImageFullPath,
  getProjectImagePath,
  getProjectImageRootDirPath,
} from "../lib/storage.js";
import { getBasePath } from "../lib/config.js";
import { isUniqueConstraintViolation } from "../lib/db.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import {
  isValidProjectImageMimeType,
  normalizeImageTarget,
  PROJECT_IMAGE_ORIGINAL_FILENAME_MAX,
  type ProjectImage,
} from "@branchforge/shared";
import { logWarn, LogEventType } from "../lib/logger.js";

export interface UploadProjectImageInput {
  originalFilename: string;
  normalizedTarget?: string;
  tooltip: { buffer: Buffer; mimeType: string };
  modal: { buffer: Buffer; mimeType: string };
}

export interface ReplaceProjectImageInput {
  originalFilename?: string;
  tooltip: { buffer: Buffer; mimeType: string };
  modal: { buffer: Buffer; mimeType: string };
}

function extensionForMimeType(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === "image/webp") return "webp";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "webp";
}

function mapToProjectImage(row: ProjectImageRow): ProjectImage {
  const basePath = getBasePath();
  return {
    id: row.id,
    projectId: row.projectId,
    originalFilename: row.originalFilename,
    normalizedTarget: row.normalizedTarget,
    tooltipUrl: getProjectImagePath(
      row.projectId,
      row.tooltipFilename,
      basePath
    ),
    modalUrl: getProjectImagePath(row.projectId, row.modalFilename, basePath),
    createdAt: row.createdAt.toISOString(),
  };
}

async function unlinkProjectImageFile(
  projectId: string,
  filename: string
): Promise<void> {
  try {
    const filePath = getProjectImageFullPath(projectId, filename);
    {
      const rootDir = getProjectImageRootDirPath();
      const relative = path.relative(rootDir, filePath);
      if (
        relative.startsWith(".." + path.sep) ||
        relative === ".." ||
        path.isAbsolute(relative)
      ) {
        throw new ValidationError("Invalid project image path");
      }
    }
    await fs.unlink(filePath);
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      logWarn(LogEventType.SERVICE_ERROR, {
        message: `Failed to delete project image file: ${filename}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Write tooltip and modal image files with path containment checks.
 * Both writes run in parallel via Promise.all.
 */
async function writeImageFiles(
  projectId: string,
  tooltipBuffer: Buffer,
  tooltipFilename: string,
  modalBuffer: Buffer,
  modalFilename: string
): Promise<void> {
  const tooltipPath = getProjectImageFullPath(projectId, tooltipFilename);
  const modalPath = getProjectImageFullPath(projectId, modalFilename);

  {
    const rootDir = getProjectImageRootDirPath();
    const tooltipRelative = path.relative(rootDir, tooltipPath);
    const modalRelative = path.relative(rootDir, modalPath);
    if (
      tooltipRelative.startsWith(".." + path.sep) ||
      tooltipRelative === ".." ||
      path.isAbsolute(tooltipRelative) ||
      modalRelative.startsWith(".." + path.sep) ||
      modalRelative === ".." ||
      path.isAbsolute(modalRelative)
    ) {
      throw new ValidationError("Invalid project image path");
    }
  }

  await Promise.all([
    fs.writeFile(tooltipPath, tooltipBuffer),
    fs.writeFile(modalPath, modalBuffer),
  ]);
}

function validateOriginalFilename(raw: string): string {
  const originalFilename = raw.trim();
  if (!originalFilename) {
    throw new ValidationError("originalFilename is required");
  }
  if (originalFilename.length > PROJECT_IMAGE_ORIGINAL_FILENAME_MAX) {
    throw new ValidationError(
      `originalFilename must be ${PROJECT_IMAGE_ORIGINAL_FILENAME_MAX} characters or fewer`
    );
  }
  return originalFilename;
}

function assertValidImageParts(input: {
  tooltip: { mimeType: string };
  modal: { mimeType: string };
}): void {
  if (!isValidProjectImageMimeType(input.tooltip.mimeType)) {
    throw new ValidationError("Invalid tooltip image type");
  }
  if (!isValidProjectImageMimeType(input.modal.mimeType)) {
    throw new ValidationError("Invalid modal image type");
  }
}

/**
 * List all project images for a project.
 */
export async function listProjectImages(
  projectId: string,
  userId: string
): Promise<ProjectImage[]> {
  await requireProjectAccess(projectId, userId);

  const rows = await getDb()
    .select()
    .from(projectImages)
    .where(eq(projectImages.projectId, projectId))
    .orderBy(asc(projectImages.createdAt));

  return rows.map(mapToProjectImage);
}

/**
 * Upload tooltip + modal preview images for a normalized target.
 */
export async function uploadProjectImage(
  projectId: string,
  userId: string,
  input: UploadProjectImageInput
): Promise<ProjectImage> {
  await requireProjectOwnership(projectId, userId);

  const originalFilename = validateOriginalFilename(input.originalFilename);

  const derivedTarget = normalizeImageTarget(originalFilename);
  if (!derivedTarget) {
    throw new ValidationError(
      "Could not derive a valid normalized target from originalFilename"
    );
  }

  if (
    input.normalizedTarget !== undefined &&
    input.normalizedTarget.trim() !== "" &&
    normalizeImageTarget(input.normalizedTarget) !== derivedTarget
  ) {
    throw new ValidationError(
      "normalizedTarget does not match originalFilename"
    );
  }

  assertValidImageParts(input);

  const tooltipExt = extensionForMimeType(input.tooltip.mimeType);
  const modalExt = extensionForMimeType(input.modal.mimeType);
  const tooltipFilename = generateProjectImageFilename("tooltip", tooltipExt);
  const modalFilename = generateProjectImageFilename("modal", modalExt);

  await ensureProjectImageDir(projectId);
  await writeImageFiles(
    projectId,
    input.tooltip.buffer,
    tooltipFilename,
    input.modal.buffer,
    modalFilename
  );

  try {
    const [created] = await getDb()
      .insert(projectImages)
      .values({
        projectId,
        originalFilename,
        normalizedTarget: derivedTarget,
        tooltipFilename,
        modalFilename,
      })
      .returning();

    if (!created) {
      throw new ValidationError("Failed to create project image");
    }

    return mapToProjectImage(created);
  } catch (error) {
    await unlinkProjectImageFile(projectId, tooltipFilename);
    await unlinkProjectImageFile(projectId, modalFilename);

    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(
        "A project image with this normalized target already exists"
      );
    }

    throw error;
  }
}

/**
 * Replace tooltip + modal files for an existing project image.
 *
 * Writes new files first, updates the DB row, then unlinks the previous files
 * so a failed upload never leaves the target without an image.
 */
export async function replaceProjectImage(
  imageId: string,
  userId: string,
  input: ReplaceProjectImageInput
): Promise<ProjectImage> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(projectImages)
    .where(eq(projectImages.id, imageId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Project image");
  }

  await requireProjectOwnership(existing.projectId, userId);
  assertValidImageParts(input);

  let originalFilename = existing.originalFilename;
  if (input.originalFilename !== undefined) {
    originalFilename = validateOriginalFilename(input.originalFilename);
    const derivedTarget = normalizeImageTarget(originalFilename);
    if (!derivedTarget || derivedTarget !== existing.normalizedTarget) {
      throw new ValidationError(
        "Replacement filename must match the existing normalized target"
      );
    }
  }

  const tooltipExt = extensionForMimeType(input.tooltip.mimeType);
  const modalExt = extensionForMimeType(input.modal.mimeType);
  const tooltipFilename = generateProjectImageFilename("tooltip", tooltipExt);
  const modalFilename = generateProjectImageFilename("modal", modalExt);

  await ensureProjectImageDir(existing.projectId);
  await writeImageFiles(
    existing.projectId,
    input.tooltip.buffer,
    tooltipFilename,
    input.modal.buffer,
    modalFilename
  );

  try {
    const [updated] = await db
      .update(projectImages)
      .set({
        originalFilename,
        tooltipFilename,
        modalFilename,
      })
      .where(eq(projectImages.id, imageId))
      .returning();

    if (!updated) {
      throw new NotFoundError("Project image");
    }

    await unlinkProjectImageFile(existing.projectId, existing.tooltipFilename);
    await unlinkProjectImageFile(existing.projectId, existing.modalFilename);

    return mapToProjectImage(updated);
  } catch (error) {
    await unlinkProjectImageFile(existing.projectId, tooltipFilename);
    await unlinkProjectImageFile(existing.projectId, modalFilename);
    throw error;
  }
}

/**
 * Delete a project image and its files.
 *
 * Deletes the DB row first, then unlinks files, so a failed unlink cannot leave
 * a row pointing at missing files.
 */
export async function deleteProjectImage(
  imageId: string,
  userId: string
): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({
      id: projectImages.id,
      projectId: projectImages.projectId,
      tooltipFilename: projectImages.tooltipFilename,
      modalFilename: projectImages.modalFilename,
      ownerId: projects.userId,
    })
    .from(projectImages)
    .innerJoin(projects, eq(projectImages.projectId, projects.id))
    .where(eq(projectImages.id, imageId))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Project image");
  }

  if (row.ownerId !== userId) {
    throw new ForbiddenError("You do not have access to this project");
  }

  const deleted = await db
    .delete(projectImages)
    .where(eq(projectImages.id, imageId))
    .returning({
      id: projectImages.id,
      projectId: projectImages.projectId,
      tooltipFilename: projectImages.tooltipFilename,
      modalFilename: projectImages.modalFilename,
    });

  if (deleted.length === 0) {
    throw new NotFoundError("Project image");
  }

  const image = deleted[0];
  await unlinkProjectImageFile(image.projectId, image.tooltipFilename);
  await unlinkProjectImageFile(image.projectId, image.modalFilename);
}
