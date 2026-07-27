/**
 * Project Images Routes Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { projectImagesRoutes } from "../project-images.routes.js";
import * as projectImagesService from "../../services/project-images.service.js";
import {
  globalErrorHandler,
  NotFoundError,
} from "../../middleware/error-handler.middleware.js";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const IMAGE_ID = "770e8400-e29b-41d4-a716-446655440002";

vi.mock("../../services/project-images.service.js", () => ({
  listProjectImages: vi.fn(),
  uploadProjectImage: vi.fn(),
  replaceProjectImage: vi.fn(),
  deleteProjectImage: vi.fn(),
}));

vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: async (request: any) => {
    request.user = {
      id: "user-123",
      email: "test@example.com",
      role: "OWNER" as const,
    };
  },
}));

const minimalPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describe("ProjectImagesRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();

    fastify = Fastify();
    // Match production default (files: 1). The route must override to 2
    // because each upload sends tooltip + modal parts.
    await fastify.register(multipart, {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
      },
    });
    await projectImagesRoutes(fastify);
    fastify.setErrorHandler(globalErrorHandler);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  it("GET /projects/:projectId/images returns images", async () => {
    const image = {
      id: IMAGE_ID,
      projectId: PROJECT_ID,
      originalFilename: "eileen_happy.png",
      normalizedTarget: "eileen_happy",
      tooltipUrl: `/api/uploads/project-images/${PROJECT_ID}/t.webp`,
      modalUrl: `/api/uploads/project-images/${PROJECT_ID}/m.webp`,
      createdAt: "2024-06-01T12:00:00.000Z",
    };
    vi.mocked(projectImagesService.listProjectImages).mockResolvedValue([
      image,
    ]);

    const response = await fastify.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/images`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ images: [image] });
    expect(projectImagesService.listProjectImages).toHaveBeenCalledWith(
      PROJECT_ID,
      "user-123"
    );
  });

  it("POST /projects/:projectId/images uploads image", async () => {
    const image = {
      id: IMAGE_ID,
      projectId: PROJECT_ID,
      originalFilename: "eileen_happy.png",
      normalizedTarget: "eileen_happy",
      tooltipUrl: `/api/uploads/project-images/${PROJECT_ID}/t.webp`,
      modalUrl: `/api/uploads/project-images/${PROJECT_ID}/m.webp`,
      createdAt: "2024-06-01T12:00:00.000Z",
    };
    vi.mocked(projectImagesService.uploadProjectImage).mockResolvedValue(image);

    const formData = new FormData();
    formData.append("originalFilename", "eileen_happy.png");
    formData.append(
      "tooltip",
      new Blob([minimalPng], { type: "image/png" }),
      "tooltip.png"
    );
    formData.append(
      "modal",
      new Blob([minimalPng], { type: "image/png" }),
      "modal.png"
    );

    const response = await fastify.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/images`,
      payload: formData as any,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ image });
    expect(projectImagesService.uploadProjectImage).toHaveBeenCalledWith(
      PROJECT_ID,
      "user-123",
      expect.objectContaining({
        originalFilename: "eileen_happy.png",
        tooltip: expect.objectContaining({ mimeType: "image/png" }),
        modal: expect.objectContaining({ mimeType: "image/png" }),
      })
    );
  });

  it("POST /projects/:projectId/images returns 400 when file exceeds size limit", async () => {
    const largeBuffer = new Uint8Array(6 * 1024 * 1024); // 6MB > 5MB limit
    const formData = new FormData();
    formData.append("originalFilename", "test.png");
    formData.append(
      "tooltip",
      new Blob([largeBuffer], { type: "image/png" }),
      "tooltip.png"
    );
    formData.append(
      "modal",
      new Blob([minimalPng], { type: "image/png" }),
      "modal.png"
    );

    const response = await fastify.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/images`,
      payload: formData as any,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "ValidationError",
    });
  });

  it("POST /projects/:projectId/images returns 400 when too many files", async () => {
    const formData = new FormData();
    formData.append("originalFilename", "test.png");
    formData.append(
      "tooltip",
      new Blob([minimalPng], { type: "image/png" }),
      "tooltip.png"
    );
    formData.append(
      "modal",
      new Blob([minimalPng], { type: "image/png" }),
      "modal.png"
    );
    formData.append(
      "extra",
      new Blob([minimalPng], { type: "image/png" }),
      "extra.png"
    );

    const response = await fastify.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/images`,
      payload: formData as any,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "ValidationError",
    });
  });

  it("PUT /project-images/:imageId replaces image", async () => {
    const image = {
      id: IMAGE_ID,
      projectId: PROJECT_ID,
      originalFilename: "eileen_happy.png",
      normalizedTarget: "eileen_happy",
      tooltipUrl: `/api/uploads/project-images/${PROJECT_ID}/t.webp`,
      modalUrl: `/api/uploads/project-images/${PROJECT_ID}/m.webp`,
      createdAt: "2024-06-01T12:00:00.000Z",
    };
    vi.mocked(projectImagesService.replaceProjectImage).mockResolvedValue(
      image
    );

    const formData = new FormData();
    formData.append("originalFilename", "eileen_happy.png");
    formData.append(
      "tooltip",
      new Blob([minimalPng], { type: "image/png" }),
      "tooltip.png"
    );
    formData.append(
      "modal",
      new Blob([minimalPng], { type: "image/png" }),
      "modal.png"
    );

    const response = await fastify.inject({
      method: "PUT",
      url: `/project-images/${IMAGE_ID}`,
      payload: formData as any,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ image });
    expect(projectImagesService.replaceProjectImage).toHaveBeenCalledWith(
      IMAGE_ID,
      "user-123",
      expect.objectContaining({
        originalFilename: "eileen_happy.png",
        tooltip: expect.objectContaining({ mimeType: "image/png" }),
        modal: expect.objectContaining({ mimeType: "image/png" }),
      })
    );
  });

  it("DELETE /project-images/:imageId deletes image", async () => {
    vi.mocked(projectImagesService.deleteProjectImage).mockResolvedValue();

    const response = await fastify.inject({
      method: "DELETE",
      url: `/project-images/${IMAGE_ID}`,
    });

    expect(response.statusCode).toBe(204);
    expect(projectImagesService.deleteProjectImage).toHaveBeenCalledWith(
      IMAGE_ID,
      "user-123"
    );
  });

  it("DELETE /project-images/:imageId maps NotFoundError", async () => {
    vi.mocked(projectImagesService.deleteProjectImage).mockRejectedValue(
      new NotFoundError("Project image")
    );

    const response = await fastify.inject({
      method: "DELETE",
      url: `/project-images/${IMAGE_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });
});
