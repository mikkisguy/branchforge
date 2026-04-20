/**
 * Zip Import Routes
 *
 * Routes for importing Ren'Py projects from zip files.
 * These routes must be registered after the multipart plugin is loaded.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/index.js";
import { projects } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateParams } from "../middleware/validation.middleware.js";
import {
  projectIdParamsSchema,
  createProjectSchema,
  validateData,
} from "../lib/validation.js";
import {
  importZipFile,
  type ImportZipResult,
} from "../services/zip-import.service.js";
import { createProject, deleteProject } from "../services/projects.service.js";
import type { PublicProject } from "@branchforge/shared";
import type { MultipartFile } from "@fastify/multipart";
import {
  HttpError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum zip file size for import (50MB)
 * Ren'Py projects can be large, so we allow a reasonable size.
 */
export const ZIP_IMPORT_MAX_SIZE_MB = 50;
export const ZIP_IMPORT_MAX_SIZE = ZIP_IMPORT_MAX_SIZE_MB * 1024 * 1024;

/**
 * Allowed MIME types for zip files
 *
 * Note: MIME types can be unreliable, so the .zip extension check
 * (isZipFile) is the primary validation. This list includes common
 * zip MIME types that some systems send.
 */
const ZIP_ALLOWED_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "application/octet-stream",
];

// ============================================================================
// Types
// ============================================================================

interface ImportZipParams {
  projectId: string;
}

interface ImportZipResponse {
  success: boolean;
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  labelsCreated: number;
  error?: string;
}

interface ImportProjectResponse {
  success: boolean;
  project?: PublicProject;
  filesImported: number;
  filesUpdated: number;
  filesSkipped: number;
  labelsCreated: number;
  error?: string;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate MIME type for zip files
 */
function isValidZipMimeType(mimeType: string | undefined | null): boolean {
  if (!mimeType || typeof mimeType !== "string") {
    return false;
  }
  return ZIP_ALLOWED_MIME_TYPES.includes(
    mimeType.toLowerCase() as (typeof ZIP_ALLOWED_MIME_TYPES)[number]
  );
}

/**
 * Normalize multipart file-size errors from Fastify/Busboy variants.
 */
function isMultipartFileTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  if (
    code === "LIMIT_FILE_SIZE" ||
    code === "FST_REQ_FILE_TOO_LARGE" ||
    code === "FST_FILES_LIMIT" ||
    code === "FST_PARTS_LIMIT"
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("file too large") ||
    message.includes("filesize limit") ||
    message.includes("file size")
  );
}

/**
 * Check if the uploaded file has a .zip extension
 */
function isZipFile(filename: string | undefined): boolean {
  if (!filename) {
    return false;
  }
  return filename.toLowerCase().endsWith(".zip");
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Import a Ren'Py project from a zip file
 *
 * POST /projects/:projectId/import/zip
 * Requires authentication
 * Accepts multipart/form-data with a zip file
 */
async function importZipHandler(
  request: FastifyRequest<{ Params: ImportZipParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const db = getDb();

    // Verify project access
    const [project] = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      reply.status(404).send({ error: "Not Found" } as ErrorResponse);
      return;
    }

    if (project.userId !== user.id) {
      reply.status(403).send({ error: "Forbidden" } as ErrorResponse);
      return;
    }

    // Parse multipart form data with fileSize limit enforced at stream creation
    let data;
    try {
      data = await request.file({
        limits: { fileSize: ZIP_IMPORT_MAX_SIZE },
      });
    } catch (error) {
      if (isMultipartFileTooLargeError(error)) {
        throw new ValidationError(
          `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
        );
      }
      throw error;
    }

    if (!data) {
      reply.status(400).send({ error: "No file uploaded" } as ErrorResponse);
      return;
    }

    const file = data as MultipartFile;

    // Check file extension
    if (!isZipFile(file.filename)) {
      throw new ValidationError("File must be a .zip file");
    }

    // Validate MIME type (optional, since it can be unreliable)
    if (file.mimetype && !isValidZipMimeType(file.mimetype)) {
      throw new ValidationError("File must be a valid zip file");
    }

    // Read file into buffer
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err: unknown) {
      // Handle multipart plugin errors like file size limit exceeded
      if (isMultipartFileTooLargeError(err)) {
        throw new ValidationError(
          `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
        );
      }
      throw err;
    }

    // Check if file was truncated due to size limit after buffering
    if (file.file.truncated) {
      throw new ValidationError(
        `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
      );
    }

    // Validate the buffered file size as the authoritative check
    if (buffer.length > ZIP_IMPORT_MAX_SIZE) {
      throw new ValidationError(
        `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
      );
    }

    // Import the zip file
    const result: ImportZipResult = await importZipFile(projectId, buffer);

    if (!result.success) {
      reply.status(400).send({
        error: result.error || "Failed to import zip file",
      } as ErrorResponse);
      return;
    }

    reply.status(200).send(result as ImportZipResponse);
  } catch (error) {
    // Re-throw HttpError instances (e.g., ValidationError) so the global error handler can use their status code
    if (error instanceof HttpError) {
      throw error;
    }
    // Handle multipart file size limit errors (from busboy)
    if (isMultipartFileTooLargeError(error)) {
      throw new ValidationError(
        `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
      );
    }
    request.log.error(error);
    reply.status(500).send({ error: "Internal server error" } as ErrorResponse);
  }
}

/**
 * Import a new project from a zip file
 *
 * POST /projects/import/zip
 * Requires authentication
 * Accepts multipart/form-data with a zip file and project metadata
 */
async function importProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.id;

  let data;
  try {
    data = await request.file({
      limits: {
        fileSize: ZIP_IMPORT_MAX_SIZE,
      },
    });
  } catch (error) {
    if (isMultipartFileTooLargeError(error)) {
      reply.status(413).send({
        error: `File size exceeds ${ZIP_IMPORT_MAX_SIZE_MB}MB limit`,
      });
      return;
    }
    throw error;
  }

  if (!data) {
    reply.status(400).send({ error: "No file provided" });
    return;
  }

  const file = data as MultipartFile;

  if (!isZipFile(file.filename)) {
    reply.status(400).send({ error: "File must be a .zip file" });
    return;
  }

  const projectNameField = data.fields.projectName;
  const projectDescriptionField = data.fields.projectDescription;

  const projectName =
    projectNameField && "value" in projectNameField
      ? projectNameField.value
      : undefined;
  const projectDescription =
    projectDescriptionField && "value" in projectDescriptionField
      ? projectDescriptionField.value
      : undefined;

  try {
    // Validate project data against schema (handles trimming and max length)
    const validatedProjectData = validateData(
      {
        name: projectName,
        description: projectDescription,
        source: "ZIP",
      },
      createProjectSchema,
      "Invalid project data"
    );
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err: unknown) {
      if (isMultipartFileTooLargeError(err)) {
        reply.status(413).send({
          error: `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`,
        });
        return;
      }
      throw err;
    }

    if (file.file.truncated) {
      reply.status(413).send({
        error: `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`,
      });
      return;
    }

    if (buffer.length > ZIP_IMPORT_MAX_SIZE) {
      reply.status(413).send({
        error: `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`,
      });
      return;
    }

    // Only create project after file validations pass
    const newProject = await createProject(userId, validatedProjectData);

    let result: ImportZipResult;
    try {
      result = await importZipFile(newProject.id, buffer);
    } catch (importErr) {
      // Clean up orphaned project if importZipFile throws
      try {
        await deleteProject(userId, newProject.id);
        request.log.info(
          { projectId: newProject.id },
          "Cleaned up partially created project after importZipFile threw"
        );
      } catch (deleteErr) {
        request.log.error(
          { err: deleteErr, projectId: newProject.id },
          "Failed to cleanup partially created project after importZipFile threw"
        );
      }
      // Re-throw to be handled by outer catch or global error handler
      throw importErr;
    }

    if (!result.success) {
      try {
        await deleteProject(userId, newProject.id);
        request.log.info(
          { projectId: newProject.id },
          "Cleaned up partially created project due to failed zip import"
        );
      } catch (deleteErr) {
        request.log.error(
          { err: deleteErr, projectId: newProject.id },
          "Failed to cleanup partially created project"
        );
      }

      reply.status(400).send({
        success: result.success,
        filesImported: result.filesImported,
        filesUpdated: result.filesUpdated,
        filesSkipped: result.filesSkipped,
        labelsCreated: result.labelsCreated,
        error: result.error || "Failed to import zip file",
      } as ImportProjectResponse);
      return;
    }

    reply.status(201).send({
      success: result.success,
      project: newProject,
      filesImported: result.filesImported,
      filesUpdated: result.filesUpdated,
      filesSkipped: result.filesSkipped,
      labelsCreated: result.labelsCreated,
      error: result.error,
    } as ImportProjectResponse);
  } catch (err) {
    // Re-throw HttpError instances (e.g., ValidationError) so the global error handler can use their status code
    if (err instanceof HttpError) {
      throw err;
    }
    request.log.error(
      { err },
      "importProjectHandler: Failed to import project from ZIP"
    );
    reply.status(500).send({
      success: false,
      error:
        "Failed to import project from ZIP file. Please check the file format and try again.",
    } as ImportProjectResponse);
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

/**
 * Zip import routes (must be registered after multipart plugin)
 */
export async function zipImportRoutes(fastify: FastifyInstance): Promise<void> {
  // Import new project from zip file
  fastify.post(
    "/projects/import/zip",
    {
      onRequest: authenticate,
    },
    importProjectHandler
  );

  // Import zip file into existing project
  fastify.post<{ Params: ImportZipParams }>(
    "/projects/:projectId/import/zip",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    importZipHandler
  );
}
