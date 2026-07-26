/**
 * Project Images Routes
 *
 * Thin HTTP wrappers for visual preview image CRUD.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateParams } from "../middleware/validation.middleware.js";
import { ValidationError } from "../middleware/error-handler.middleware.js";
import {
  projectIdParamsSchema,
  projectImageIdParamsSchema,
  type ProjectIdParams,
  type ProjectImageIdParams,
} from "../lib/validation.js";
import {
  PROJECT_IMAGE_MAX_SIZE,
  PROJECT_IMAGE_MAX_SIZE_MB,
  type ProjectImage,
} from "@branchforge/shared";
import {
  deleteProjectImage,
  listProjectImages,
  replaceProjectImage,
  uploadProjectImage,
} from "../services/project-images.service.js";

interface ListProjectImagesResponse {
  images: ProjectImage[];
}

interface UploadProjectImageResponse {
  image: ProjectImage;
}

interface ParsedUpload {
  originalFilename?: string;
  normalizedTarget?: string;
  tooltip?: { buffer: Buffer; mimeType: string };
  modal?: { buffer: Buffer; mimeType: string };
}

function getErrorCode(error: unknown): string {
  if (!(error instanceof Error) || !("code" in error)) {
    return "";
  }
  return String((error as { code?: unknown }).code ?? "");
}

function isMultipartFileTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = getErrorCode(error);
  if (code === "FST_REQ_FILE_TOO_LARGE" || code === "LIMIT_FILE_SIZE") {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("file too large") ||
    message.includes("limit file size") ||
    message.includes("filesize limit")
  );
}

function isMultipartFilesLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = getErrorCode(error);
  if (
    code === "FST_FILES_LIMIT" ||
    code === "FST_PARTS_LIMIT" ||
    code === "LIMIT_FILE_COUNT" ||
    code === "LIMIT_PART_COUNT"
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("reach files limit") ||
    message.includes("files limit") ||
    message.includes("parts limit")
  );
}

function mapMultipartValidationError(error: unknown): never {
  if (isMultipartFileTooLargeError(error)) {
    throw new ValidationError(
      `File must be smaller than ${PROJECT_IMAGE_MAX_SIZE_MB}MB`
    );
  }
  if (isMultipartFilesLimitError(error)) {
    throw new ValidationError(
      "Upload includes too many files. Expected tooltip and modal only."
    );
  }
  throw error;
}

async function readMultipartFile(
  part: MultipartFile
): Promise<{ buffer: Buffer; mimeType: string }> {
  let buffer: Buffer;
  try {
    buffer = await part.toBuffer();
  } catch (error) {
    mapMultipartValidationError(error);
  }

  if (part.file.truncated) {
    throw new ValidationError(
      `File must be smaller than ${PROJECT_IMAGE_MAX_SIZE_MB}MB`
    );
  }

  if (buffer.length > PROJECT_IMAGE_MAX_SIZE) {
    throw new ValidationError(
      `File must be smaller than ${PROJECT_IMAGE_MAX_SIZE_MB}MB`
    );
  }

  return { buffer, mimeType: part.mimetype };
}

async function parseProjectImageUpload(
  request: FastifyRequest
): Promise<ParsedUpload> {
  const result: ParsedUpload = {};

  try {
    // Global multipart plugin defaults to files: 1 (avatar/ZIP). This endpoint
    // always sends two files (tooltip + modal), so override per-request.
    const parts = request.parts({
      limits: {
        fileSize: PROJECT_IMAGE_MAX_SIZE,
        files: 2,
      },
    });

    for await (const part of parts) {
      if (part.type === "file") {
        const filePart = await readMultipartFile(part);
        if (part.fieldname === "tooltip") {
          result.tooltip = filePart;
        } else if (part.fieldname === "modal") {
          result.modal = filePart;
        }
      } else if (part.type === "field") {
        const value =
          typeof part.value === "string"
            ? part.value
            : String(part.value ?? "");
        if (part.fieldname === "originalFilename") {
          result.originalFilename = value;
        } else if (part.fieldname === "normalizedTarget") {
          result.normalizedTarget = value;
        }
      }
    }
  } catch (error) {
    mapMultipartValidationError(error);
  }

  return result;
}

async function listProjectImagesHandler(
  request: FastifyRequest<{ Params: ProjectIdParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const images = await listProjectImages(projectId, request.user!.id);
  const response: ListProjectImagesResponse = { images };
  reply.status(200).send(response);
}

async function uploadProjectImageHandler(
  request: FastifyRequest<{ Params: ProjectIdParams }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const parsed = await parseProjectImageUpload(request);

  if (!parsed.originalFilename?.trim()) {
    throw new ValidationError("originalFilename is required");
  }
  if (!parsed.tooltip) {
    throw new ValidationError("tooltip file is required");
  }
  if (!parsed.modal) {
    throw new ValidationError("modal file is required");
  }

  const image = await uploadProjectImage(projectId, request.user!.id, {
    originalFilename: parsed.originalFilename,
    normalizedTarget: parsed.normalizedTarget,
    tooltip: parsed.tooltip,
    modal: parsed.modal,
  });

  const response: UploadProjectImageResponse = { image };
  reply.status(201).send(response);
}

async function replaceProjectImageHandler(
  request: FastifyRequest<{ Params: ProjectImageIdParams }>,
  reply: FastifyReply
): Promise<void> {
  const { imageId } = request.params;
  const parsed = await parseProjectImageUpload(request);

  if (!parsed.tooltip) {
    throw new ValidationError("tooltip file is required");
  }
  if (!parsed.modal) {
    throw new ValidationError("modal file is required");
  }

  const image = await replaceProjectImage(imageId, request.user!.id, {
    originalFilename: parsed.originalFilename,
    tooltip: parsed.tooltip,
    modal: parsed.modal,
  });

  const response: UploadProjectImageResponse = { image };
  reply.status(200).send(response);
}

async function deleteProjectImageHandler(
  request: FastifyRequest<{ Params: ProjectImageIdParams }>,
  reply: FastifyReply
): Promise<void> {
  const { imageId } = request.params;
  await deleteProjectImage(imageId, request.user!.id);
  reply.status(204).send();
}

export async function projectImagesRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get<{ Params: ProjectIdParams }>(
    "/projects/:projectId/images",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    listProjectImagesHandler
  );

  fastify.post<{ Params: ProjectIdParams }>(
    "/projects/:projectId/images",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectIdParamsSchema),
    },
    uploadProjectImageHandler
  );

  fastify.put<{ Params: ProjectImageIdParams }>(
    "/project-images/:imageId",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectImageIdParamsSchema),
    },
    replaceProjectImageHandler
  );

  fastify.delete<{ Params: ProjectImageIdParams }>(
    "/project-images/:imageId",
    {
      onRequest: authenticate,
      preValidation: validateParams(projectImageIdParamsSchema),
    },
    deleteProjectImageHandler
  );
}
