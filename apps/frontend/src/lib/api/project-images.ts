/**
 * Project Images API Client
 *
 * Client for project preview image list/upload/delete operations.
 */

import { request } from "./client";
import type { ProjectImage } from "@branchforge/shared";

export interface ListProjectImagesResponse {
  images: ProjectImage[];
}

export interface UploadProjectImageResponse {
  image: ProjectImage;
}

export interface UploadProjectImageInput {
  originalFilename: string;
  normalizedTarget?: string;
  tooltip: File;
  modal: File;
}

export interface ReplaceProjectImageInput {
  originalFilename?: string;
  tooltip: File;
  modal: File;
}

export const projectImagesApi = {
  async list(projectId: string): Promise<ListProjectImagesResponse> {
    return await request<ListProjectImagesResponse>(
      `/projects/${encodeURIComponent(projectId)}/images`,
      { method: "GET" }
    );
  },

  async upload(
    projectId: string,
    input: UploadProjectImageInput
  ): Promise<UploadProjectImageResponse> {
    const formData = new FormData();
    formData.append("originalFilename", input.originalFilename);
    if (input.normalizedTarget) {
      formData.append("normalizedTarget", input.normalizedTarget);
    }
    formData.append("tooltip", input.tooltip);
    formData.append("modal", input.modal);

    return await request<UploadProjectImageResponse>(
      `/projects/${encodeURIComponent(projectId)}/images`,
      {
        method: "POST",
        body: formData,
      }
    );
  },

  async replace(
    imageId: string,
    input: ReplaceProjectImageInput
  ): Promise<UploadProjectImageResponse> {
    const formData = new FormData();
    if (input.originalFilename) {
      formData.append("originalFilename", input.originalFilename);
    }
    formData.append("tooltip", input.tooltip);
    formData.append("modal", input.modal);

    return await request<UploadProjectImageResponse>(
      `/project-images/${encodeURIComponent(imageId)}`,
      {
        method: "PUT",
        body: formData,
      }
    );
  },

  async delete(imageId: string): Promise<void> {
    await request(`/project-images/${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    });
  },
};

export const listProjectImages = projectImagesApi.list.bind(projectImagesApi);
export const uploadProjectImage =
  projectImagesApi.upload.bind(projectImagesApi);
export const deleteProjectImage =
  projectImagesApi.delete.bind(projectImagesApi);
export const replaceProjectImage =
  projectImagesApi.replace.bind(projectImagesApi);
