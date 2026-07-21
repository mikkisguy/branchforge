import type { Db } from "../db/index.js";
import type { DetectedCharacter } from "./character-parser.service.js";

// GitLab API response types

export interface GitlabUser {
  id: number;
  username: string;
  name: string;
  email: string;
}

// Full GitLab repository data (from API)
export interface GitlabRepositoryFull {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  http_url_to_repo?: string;
}

// Lightweight repository data for repository selection UI
export interface GitlabRepository {
  id: number;
  name: string;
  path_with_namespace: string;
}

export interface GitlabBranch {
  name: string;
  commit: {
    id: string;
  };
}

export interface GitlabFile {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  ref: string;
}

export interface GitlabTreeItem {
  name: string;
  path: string;
  type: "blob" | "tree";
}

// Sync operation types

export type ConflictResolution =
  "branchforge_wins" | "gitlab_wins" | "manual_review";

export interface SyncOperation {
  id: string;
  projectId: string;
  operation: "EXPORT" | "IMPORT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  branch: string | null;
  conflictCount: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  detectedCharacters?: DetectedCharacter[];
}

// Type for Drizzle transaction - flexible interface to accept both typed and generic transactions
// This avoids schema type inference issues while maintaining type safety for query methods
export interface Transaction {
  select: Db["select"];
  insert: Db["insert"];
  update: Db["update"];
  delete: Db["delete"];
}
