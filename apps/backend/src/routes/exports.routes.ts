/**
 * Export Routes
 *
 * Routes for project export operations including generating,
 * listing, and downloading exports.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import JSZip from "jszip";
import {
  generateExport,
  listExports,
  getExportForDownload,
  getExportPreview,
} from "../services/export.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateParams } from "../middleware/validation.middleware.js";
import {
  exportProjectIdParamsSchema,
  exportDownloadParamsSchema,
} from "../lib/validation.js";
import {
  NotFoundError,
  ForbiddenError,
  RateLimitError,
} from "../middleware/error-handler.middleware.js";

// ============================================================================
// Types
// ============================================================================

interface GenerateExportResponse {
  id: string;
  fileName: string;
  fileSize: number;
  format: string;
  createdAt: string;
}

interface ListExportsResponse {
  exports: Array<{
    id: string;
    projectId: string;
    format: string;
    fileName: string;
    fileSize: number | null;
    createdAt: string;
  }>;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Generate a new export for a project
 *
 * POST /projects/:projectId/export
 * Requires authentication
 */
async function generateExportHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const result = await generateExport(projectId, user.id);

    reply.status(201).send(result as GenerateExportResponse);
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `generateExportHandler: Failed to generate export: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: error.userMessage });
      return;
    }
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: error.userMessage });
      return;
    }
    if (error instanceof RateLimitError) {
      reply.status(429).send({
        error: error.userMessage,
        retryAfter: error.retryAfter,
      });
      return;
    }
    reply.status(500).send({ error: "Internal server error" });
  }
}

/**
 * List exports for a project
 *
 * GET /projects/:projectId/exports
 * Requires authentication
 */
async function listExportsHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const exports = await listExports(projectId, user.id);

    reply.status(200).send({ exports } as ListExportsResponse);
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `listExportsHandler: Failed to list exports: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: error.userMessage });
      return;
    }
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: error.userMessage });
      return;
    }
    reply.status(500).send({ error: "Internal server error" });
  }
}

/**
 * Preview generated export files (variables, stats, definitions)
 *
 * GET /projects/:projectId/export-preview
 * Requires authentication
 */
async function exportPreviewHandler(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId } = request.params;
  const user = request.user!;

  try {
    const result = await getExportPreview(projectId, user.id);

    reply.status(200).send(result);
  } catch (error) {
    request.log.error(
      { err: error, projectId },
      `exportPreviewHandler: Failed to get export preview: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: error.userMessage });
      return;
    }
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: error.userMessage });
      return;
    }
    if (error instanceof RateLimitError) {
      reply.status(429).send({
        error: error.userMessage,
        retryAfter: error.retryAfter,
      });
      return;
    }
    reply.status(500).send({ error: "Internal server error" });
  }
}

/**
 * Download an export as a zip file
 *
 * GET /projects/:projectId/exports/:exportId/download
 * Requires authentication
 */
async function downloadExportHandler(
  request: FastifyRequest<{
    Params: { projectId: string; exportId: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId, exportId } = request.params;
  const user = request.user!;

  try {
    const { fileName, content } = await getExportForDownload(
      exportId,
      projectId,
      user.id
    );

    // Parse the stored JSON content into a zip
    const files: Record<string, string> = JSON.parse(content);
    const zip = new JSZip();

    for (const [filePath, fileContent] of Object.entries(files)) {
      zip.file(filePath, fileContent);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    reply.header("Content-Length", zipBuffer.length);
    reply.send(zipBuffer);
  } catch (error) {
    request.log.error(
      { err: error, projectId, exportId },
      `downloadExportHandler: Failed to download export: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    if (error instanceof ForbiddenError) {
      reply.status(403).send({ error: error.userMessage });
      return;
    }
    if (error instanceof NotFoundError) {
      reply.status(404).send({ error: error.userMessage });
      return;
    }
    reply.status(500).send({ error: "Internal server error" });
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

export async function exportsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/export",
    {
      onRequest: authenticate,
      preValidation: validateParams(exportProjectIdParamsSchema),
    },
    generateExportHandler
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/exports",
    {
      onRequest: authenticate,
      preValidation: validateParams(exportProjectIdParamsSchema),
    },
    listExportsHandler
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/export-preview",
    {
      onRequest: authenticate,
      preValidation: validateParams(exportProjectIdParamsSchema),
    },
    exportPreviewHandler
  );

  fastify.get<{
    Params: { projectId: string; exportId: string };
  }>(
    "/projects/:projectId/exports/:exportId/download",
    {
      onRequest: authenticate,
      preValidation: validateParams(exportDownloadParamsSchema),
    },
    downloadExportHandler
  );
}
