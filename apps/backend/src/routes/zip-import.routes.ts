/**
 * Zip Import Routes
 *
 * Routes for importing Ren'Py projects from zip files.
 * These routes must be registered after the multipart plugin is loaded.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
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
  importProjectFromZip,
} from "../services/zip-import.service.js";
import { requireProjectAccess } from "../services/authz.service.js";
import type { MultipartFile } from "@fastify/multipart";
import {
  HttpError,
  ValidationError,
} from "../middleware/error-handler.middleware.js";
import {
  ZIP_IMPORT_MAX_SIZE,
  ZIP_IMPORT_MAX_SIZE_MB,
  isValidZipMimeType,
  type ImportZipResponse,
  type ImportProjectSuccess,
  type ImportProjectFailure,
} from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface ImportZipParams {
  projectId: string;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

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
    // Verify project access
    await requireProjectAccess(projectId, user.id);

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
      throw new ValidationError("No file uploaded");
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

  try {
    let data;
    try {
      data = await request.file({
        limits: {
          fileSize: ZIP_IMPORT_MAX_SIZE,
        },
      });
    } catch (error) {
      if (isMultipartFileTooLargeError(error)) {
        throw new ValidationError(
          `File size exceeds ${ZIP_IMPORT_MAX_SIZE_MB}MB limit`
        );
      }
      throw error;
    }

    if (!data) {
      throw new ValidationError("No file provided");
    }

    const file = data as MultipartFile;

    if (!isZipFile(file.filename)) {
      throw new ValidationError("File must be a .zip file");
    }

    if (file.mimetype && !isValidZipMimeType(file.mimetype)) {
      throw new ValidationError("File must be a valid zip file");
    }

    const projectNameField = data.fields.projectName ?? data.fields.name;
    const projectDescriptionField =
      data.fields.projectDescription ?? data.fields.description;

    const projectName =
      projectNameField && "value" in projectNameField
        ? projectNameField.value
        : undefined;
    const projectDescription =
      projectDescriptionField && "value" in projectDescriptionField
        ? projectDescriptionField.value
        : undefined;

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
        throw new ValidationError(
          `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
        );
      }
      throw err;
    }

    if (file.file.truncated) {
      throw new ValidationError(
        `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
      );
    }

    if (buffer.length > ZIP_IMPORT_MAX_SIZE) {
      throw new ValidationError(
        `File must be smaller than ${ZIP_IMPORT_MAX_SIZE_MB}MB`
      );
    }

    const result = await importProjectFromZip(
      userId,
      validatedProjectData,
      buffer
    );

    if (!result.success) {
      const failureResponse: ImportProjectFailure = {
        success: false,
        error: result.error || "Failed to import zip file",
      };
      reply.status(400).send(failureResponse);
      return;
    }

    const successResponse: ImportProjectSuccess = {
      success: true,
      project: {
        ...result.project!,
        source: "ZIP",
      },
      filesImported: result.filesImported!,
      filesUpdated: result.filesUpdated!,
      filesSkipped: result.filesSkipped!,
      labelsCreated: result.labelsCreated!,
    };
    reply.status(201).send(successResponse);
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
    reply.status(500).send({
      error:
        "Failed to import project from ZIP file. Please check the file format and try again.",
    } as ErrorResponse);
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
