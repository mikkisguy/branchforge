/**
 * Visual preview lookup for Write Mode and Script Mode.
 *
 * Loads project images and exposes target → image matching.
 */

import { useCallback } from "react";
import {
  findProjectImageForTarget,
  type ProjectImage,
} from "@branchforge/shared";
import { useProjectImages } from "@/hooks/useProjectImages";

export interface UseVisualPreviewLookupReturn {
  images: ProjectImage[];
  isLoadingImages: boolean;
  getImageForTarget: (target: string) => ProjectImage | undefined;
  uploadImage: ReturnType<typeof useProjectImages>["uploadImage"];
  uploadProcessedImage: ReturnType<
    typeof useProjectImages
  >["uploadProcessedImage"];
  replaceImage: ReturnType<typeof useProjectImages>["replaceImage"];
  deleteImage: ReturnType<typeof useProjectImages>["deleteImage"];
  isUploadingImage: boolean;
  isDeletingImage: boolean;
}

export function useVisualPreviewLookup(
  projectId: string | null | undefined,
  options?: { enabled?: boolean }
): UseVisualPreviewLookupReturn {
  const {
    images,
    isLoadingImages,
    uploadImage,
    uploadProcessedImage,
    replaceImage,
    deleteImage,
    isUploadingImage,
    isDeletingImage,
  } = useProjectImages(projectId, options);

  const getImageForTarget = useCallback(
    (target: string) => findProjectImageForTarget(images, target),
    [images]
  );

  return {
    images,
    isLoadingImages,
    getImageForTarget,
    uploadImage,
    uploadProcessedImage,
    replaceImage,
    deleteImage,
    isUploadingImage,
    isDeletingImage,
  };
}
