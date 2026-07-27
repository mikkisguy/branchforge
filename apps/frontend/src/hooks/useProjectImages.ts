/**
 * useProjectImages Hook
 *
 * Provides project preview image state and operations using TanStack Query.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  projectImagesApi,
  type UploadProjectImageInput,
} from "@/lib/api/project-images";
import { projectImageKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import {
  processProjectImageFile,
  type ProcessedProjectImageFiles,
} from "@/lib/project-image-processing";
import type { ProjectImage } from "@branchforge/shared";

export interface ProjectImageMutationOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
}

interface ToastLike {
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
}

function createImageMutationHandlers(
  projectId: string,
  queryClient: QueryClient,
  toast: ToastLike,
  actionName: string,
  successMessage: string
) {
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: projectImageKeys.lists(projectId),
    });
  };

  return {
    onSuccess: (data: { mutationOptions?: ProjectImageMutationOptions }) => {
      invalidate();
      if (data.mutationOptions?.showSuccessToast !== false) {
        toast.success(successMessage, "Success");
      }
    },
    onError: (
      error: Error,
      variables: { mutationOptions?: ProjectImageMutationOptions }
    ) => {
      if (variables.mutationOptions?.showErrorToast !== false) {
        toast.error(`Failed to ${actionName}: ${error.message}`, "Error");
      }
    },
  };
}

export interface UseProjectImagesReturn {
  images: ProjectImage[];
  isLoadingImages: boolean;
  imagesError: Error | null;
  refreshImages: () => void;
  isUploadingImage: boolean;
  isDeletingImage: boolean;
  uploadImage: (
    file: File,
    expectedTarget?: string,
    options?: ProjectImageMutationOptions
  ) => Promise<ProjectImage>;
  uploadProcessedImage: (
    processed: ProcessedProjectImageFiles | UploadProjectImageInput,
    options?: ProjectImageMutationOptions
  ) => Promise<ProjectImage>;
  replaceImage: (
    imageId: string,
    file: File,
    expectedTarget?: string,
    options?: ProjectImageMutationOptions
  ) => Promise<ProjectImage>;
  deleteImage: (
    imageId: string,
    options?: ProjectImageMutationOptions
  ) => Promise<void>;
}

export function useProjectImages(
  projectId: string | null | undefined,
  options?: { enabled?: boolean }
): UseProjectImagesReturn {
  const queryClient = useQueryClient();
  const toast = useToast();
  const enabled =
    options?.enabled !== undefined
      ? options.enabled && !!projectId
      : !!projectId;

  const {
    data,
    isLoading: isLoadingImages,
    error: imagesError,
    refetch: refreshImages,
  } = useQuery({
    queryKey: projectImageKeys.lists(projectId ?? ""),
    queryFn: async () => {
      const response = await projectImagesApi.list(projectId!);
      return response.images;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const handlers = createImageMutationHandlers(
    projectId!,
    queryClient,
    toast,
    "upload image",
    "Preview image uploaded"
  );

  const uploadProcessedImageMutation = useMutation({
    mutationFn: async ({
      processed,
      mutationOptions,
    }: {
      processed: ProcessedProjectImageFiles | UploadProjectImageInput;
      mutationOptions?: ProjectImageMutationOptions;
    }) => {
      const response = await projectImagesApi.upload(projectId!, processed);
      return { image: response.image, mutationOptions };
    },
    ...handlers,
  });

  const uploadImageMutation = useMutation({
    mutationFn: async ({
      file,
      expectedTarget,
      mutationOptions,
    }: {
      file: File;
      expectedTarget?: string;
      mutationOptions?: ProjectImageMutationOptions;
    }) => {
      const processed = await processProjectImageFile(file, expectedTarget);
      const response = await projectImagesApi.upload(projectId!, processed);
      return { image: response.image, mutationOptions };
    },
    ...handlers,
  });

  const replaceHandlers = createImageMutationHandlers(
    projectId!,
    queryClient,
    toast,
    "replace image",
    "Preview image replaced"
  );

  const replaceImageMutation = useMutation({
    mutationFn: async ({
      imageId,
      file,
      expectedTarget,
      mutationOptions,
    }: {
      imageId: string;
      file: File;
      expectedTarget?: string;
      mutationOptions?: ProjectImageMutationOptions;
    }) => {
      const processed = await processProjectImageFile(file, expectedTarget);
      const response = await projectImagesApi.replace(imageId, {
        originalFilename: processed.originalFilename,
        tooltip: processed.tooltip,
        modal: processed.modal,
      });
      return { image: response.image, mutationOptions };
    },
    ...replaceHandlers,
  });

  const deleteHandlers = createImageMutationHandlers(
    projectId!,
    queryClient,
    toast,
    "remove image",
    "Preview image removed"
  );

  const deleteImageMutation = useMutation({
    mutationFn: async ({
      imageId,
      mutationOptions,
    }: {
      imageId: string;
      mutationOptions?: ProjectImageMutationOptions;
    }) => {
      await projectImagesApi.delete(imageId);
      return { mutationOptions };
    },
    ...deleteHandlers,
  });

  return {
    images: data ?? [],
    isLoadingImages,
    imagesError: imagesError as Error | null,
    refreshImages,
    isUploadingImage:
      uploadImageMutation.isPending ||
      uploadProcessedImageMutation.isPending ||
      replaceImageMutation.isPending,
    isDeletingImage: deleteImageMutation.isPending,
    uploadImage: (file, expectedTarget, mutationOptions) =>
      uploadImageMutation
        .mutateAsync({ file, expectedTarget, mutationOptions })
        .then(({ image }) => image),
    uploadProcessedImage: (processed, mutationOptions) =>
      uploadProcessedImageMutation
        .mutateAsync({ processed, mutationOptions })
        .then(({ image }) => image),
    replaceImage: (imageId, file, expectedTarget, mutationOptions) =>
      replaceImageMutation
        .mutateAsync({ imageId, file, expectedTarget, mutationOptions })
        .then(({ image }) => image),
    deleteImage: (imageId, mutationOptions) =>
      deleteImageMutation
        .mutateAsync({ imageId, mutationOptions })
        .then(() => undefined),
  };
}
