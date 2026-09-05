const MAX_STORED_PATH_LENGTH = 500;

function hasDisallowedPathChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f) {
      return true;
    }
    if (code >= 0x7f && code <= 0x9f) {
      return true;
    }
    if (code === 0x2028 || code === 0x2029) {
      return true;
    }
    if (code >= 0x202a && code <= 0x202e) {
      return true;
    }
    if (code >= 0x2066 && code <= 0x2069) {
      return true;
    }
  }
  return false;
}

const RESERVED_BASENAMES = new Set([
  "branchforge_variables.rpy",
  "branchforge_stats.rpy",
  "branchforge_definitions.rpy",
]);

export type CanonicalizeRpyFilePathErrorCode =
  | "EMPTY"
  | "ABSOLUTE"
  | "TRAVERSAL"
  | "CONTROL"
  | "TOO_LONG"
  | "EXTENSION"
  | "RESERVED";

export type CanonicalizeRpyFilePathResult =
  | { ok: true; filePath: string }
  | {
      ok: false;
      code: CanonicalizeRpyFilePathErrorCode;
      message: string;
    };

function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith("/") || path.startsWith("//") || /^[a-zA-Z]:/.test(path)
  );
}

function normalizeSegments(path: string): string {
  const segments = path.split("/").filter((segment) => {
    return segment !== "" && segment !== ".";
  });

  return segments.join("/");
}

function normalizeExtension(path: string): string | { code: "EXTENSION" } {
  const lastSlash = path.lastIndexOf("/");
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
  const basename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex === -1) {
    return `${dir}${basename}.rpy`;
  }

  const nameWithoutExt = basename.slice(0, dotIndex);
  const extension = basename.slice(dotIndex);

  if (nameWithoutExt === "" || extension.toLowerCase() !== ".rpy") {
    return { code: "EXTENSION" };
  }

  return `${dir}${nameWithoutExt}.rpy`;
}

/**
 * Canonicalize a user-provided Ren'Py file path for storage.
 */
export function canonicalizeRpyFilePath(
  input: string
): CanonicalizeRpyFilePathResult {
  if (hasDisallowedPathChars(input)) {
    return {
      ok: false,
      code: "CONTROL",
      message: "File path contains invalid control characters",
    };
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    return {
      ok: false,
      code: "EMPTY",
      message: "File path cannot be empty",
    };
  }

  const normalizedSlashes = trimmed.replace(/\\/g, "/");

  if (isAbsolutePath(normalizedSlashes)) {
    return {
      ok: false,
      code: "ABSOLUTE",
      message: "File path must be relative",
    };
  }

  const segments = normalizedSlashes.split("/");
  if (segments.some((segment) => segment === "..")) {
    return {
      ok: false,
      code: "TRAVERSAL",
      message: "File path cannot contain parent directory segments",
    };
  }

  const normalizedPath = normalizeSegments(normalizedSlashes);
  if (normalizedPath === "") {
    return {
      ok: false,
      code: "EMPTY",
      message: "File path cannot be empty",
    };
  }

  const withExtension = normalizeExtension(normalizedPath);
  if (typeof withExtension !== "string") {
    return {
      ok: false,
      code: "EXTENSION",
      message: "File path must have a .rpy extension",
    };
  }

  if (withExtension.length > MAX_STORED_PATH_LENGTH) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: "File path is too long",
    };
  }

  const basename =
    withExtension.lastIndexOf("/") >= 0
      ? withExtension.slice(withExtension.lastIndexOf("/") + 1)
      : withExtension;

  if (RESERVED_BASENAMES.has(basename.toLowerCase())) {
    return {
      ok: false,
      code: "RESERVED",
      message: "This file name is reserved by BranchForge",
    };
  }

  return { ok: true, filePath: withExtension };
}
