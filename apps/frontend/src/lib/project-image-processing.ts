/**
 * Client-side project image processing (canvas resize).
 */

import {
  isValidProjectImageMimeType,
  normalizeImageTarget,
  PROJECT_IMAGE_MAX_SIZE,
  PROJECT_IMAGE_MODAL_SIZE,
  PROJECT_IMAGE_ORIGINAL_FILENAME_MAX,
  PROJECT_IMAGE_TOOLTIP_SIZE,
} from "@branchforge/shared";

export { normalizeImageTarget };

export interface ProcessedProjectImageFiles {
  originalFilename: string;
  normalizedTarget: string;
  tooltip: File;
  modal: File;
}

export class ProjectImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectImageProcessingError";
  }
}

export function validateProjectImageFile(
  file: File,
  expectedTarget?: string
): string {
  if (!isValidProjectImageMimeType(file.type)) {
    throw new ProjectImageProcessingError(
      "Unsupported image type. Use JPEG, PNG, or WebP."
    );
  }

  if (file.name.length > PROJECT_IMAGE_ORIGINAL_FILENAME_MAX) {
    throw new ProjectImageProcessingError(
      `Filename exceeds the ${PROJECT_IMAGE_ORIGINAL_FILENAME_MAX} character limit.`
    );
  }

  if (file.size > PROJECT_IMAGE_MAX_SIZE) {
    throw new ProjectImageProcessingError("Image exceeds the 5MB size limit.");
  }

  const normalizedTarget = normalizeImageTarget(file.name);
  if (!normalizedTarget) {
    throw new ProjectImageProcessingError(
      "Filename must include a valid image target name."
    );
  }

  if (
    expectedTarget &&
    normalizeImageTarget(expectedTarget) !== normalizedTarget
  ) {
    throw new ProjectImageProcessingError(
      `This image targets "${normalizedTarget}" but "${normalizeImageTarget(expectedTarget)}" was expected. Rename the file or choose a matching image.`
    );
  }

  return normalizedTarget;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // react-doctor-disable-next-line react-doctor/no-create-object-url-without-revoke -- revoked in onload and onerror below; analyzer misses same-function callback pairing
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ProjectImageProcessingError("Failed to load image file."));
    };
    image.src = url;
  });
}

function tryCanvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function encodeCanvas(
  canvas: HTMLCanvasElement
): Promise<{ blob: Blob; extension: "webp" | "jpg" }> {
  const webpBlob = await tryCanvasToBlob(canvas, "image/webp", 0.9);
  if (webpBlob) {
    return { blob: webpBlob, extension: "webp" };
  }

  const jpegBlob = await tryCanvasToBlob(canvas, "image/jpeg", 0.9);
  if (jpegBlob) {
    return { blob: jpegBlob, extension: "jpg" };
  }

  throw new ProjectImageProcessingError("Failed to encode resized image.");
}

async function resizeToBlob(
  image: HTMLImageElement,
  maxSize: number
): Promise<{ blob: Blob; extension: "webp" | "jpg" }> {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new ProjectImageProcessingError("Canvas is not available.");
  }

  context.drawImage(image, 0, 0, width, height);
  return encodeCanvas(canvas);
}

function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, {
    type: blob.type || "image/webp",
  });
}

interface InternalProcessedImage {
  normalizedTarget: string;
  originalFilename: string;
  tooltipExtension: "webp" | "jpg";
  modalExtension: "webp" | "jpg";
  tooltipBlob: Blob;
  modalBlob: Blob;
}

async function processImageFile(
  file: File,
  expectedTarget?: string
): Promise<InternalProcessedImage> {
  const normalizedTarget = validateProjectImageFile(file, expectedTarget);
  const image = await loadImageFromFile(file);
  const [tooltipResult, modalResult] = await Promise.all([
    resizeToBlob(image, PROJECT_IMAGE_TOOLTIP_SIZE),
    resizeToBlob(image, PROJECT_IMAGE_MODAL_SIZE),
  ]);

  const originalFilename = file.name.includes(".")
    ? file.name
    : `${normalizedTarget}.${tooltipResult.extension}`;

  return {
    normalizedTarget,
    originalFilename,
    tooltipExtension: tooltipResult.extension,
    modalExtension: modalResult.extension,
    tooltipBlob: tooltipResult.blob,
    modalBlob: modalResult.blob,
  };
}

/**
 * Resize an image file into tooltip (200px) and modal (800px) variants.
 *
 * When `expectedTarget` is provided, the normalized filename must match it.
 */
export async function processProjectImageFile(
  file: File,
  expectedTarget?: string
): Promise<ProcessedProjectImageFiles> {
  const {
    normalizedTarget,
    originalFilename,
    tooltipExtension,
    modalExtension,
    tooltipBlob,
    modalBlob,
  } = await processImageFile(file, expectedTarget);

  return {
    originalFilename,
    normalizedTarget,
    tooltip: blobToFile(
      tooltipBlob,
      `${normalizedTarget}_tooltip.${tooltipExtension}`
    ),
    modal: blobToFile(modalBlob, `${normalizedTarget}_modal.${modalExtension}`),
  };
}
