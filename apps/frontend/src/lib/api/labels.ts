/**
 * Labels API Client
 *
 * Client for label management operations.
 */

import { request, requestVoid } from "./client";
import type {
  PublicLabel,
  LabelDetail,
  LabelCharacter,
  VariableCondition,
} from "@branchforge/shared";

// ============================================================================
// Types (imported from shared package)
// ============================================================================

export interface ListLabelsParams {
  projectId: string;
  routeKey?: string;
  status?: string;
}

export interface ListLabelsResponse {
  labels: PublicLabel[];
}

export interface GetLabelResponse {
  label: LabelDetail;
}

export type UpdateDialogueResponse =
  | {
      success: true;
      version: number;
      contentHash: string;
      fileContentHash: string;
      fileUpdatedAt: string;
    }
  | {
      success: false;
      conflict: {
        reason: "STALE_LABEL_VERSION" | "STALE_CONTENT_HASH";
        currentVersion: number;
        currentContentHash: string | null;
      };
    };

export interface LabelCharactersResponse {
  characters: LabelCharacter[];
}

export interface CreateLabelInput {
  projectId: string;
  title: string;
  projectFileId: string;
  route?: string | null;
  groupType?: string | null;
  groupValue?: string | null;
  labelNumber?: number;
  sequenceOrder?: number;
  status?: "DRAFT" | "REVIEW" | "FINAL" | null;
  visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
  afterLabelId?: string | null;
}

export interface CreateLabelResponse {
  label: PublicLabel;
}

export interface UpdateLabelInput {
  title?: string;
  route?: string | null;
  status?: "DRAFT" | "REVIEW" | "FINAL";
  visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
  labelName?: string;
  duoPairId?: string | null;
  conditions?: {
    variables?: Record<string, VariableCondition>;
    stats?: Record<string, number>;
  } | null;
}

export interface UpdateLabelResponse {
  label: PublicLabel;
}

// ============================================================================
// Labels API
// ============================================================================

export const labelsApi = {
  /**
   * List labels for a project with optional filtering
   */
  async listLabels(params: ListLabelsParams): Promise<PublicLabel[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("projectId", params.projectId);
    if (params.routeKey) searchParams.set("routeKey", params.routeKey);
    if (params.status) searchParams.set("status", params.status);

    const response = await request<ListLabelsResponse>(
      `/labels?${searchParams.toString()}`
    );
    return response.labels;
  },

  /**
   * Get a single label by ID with full details (lines and characters)
   */
  async getLabel(labelId: string): Promise<LabelDetail> {
    const response = await request<GetLabelResponse>(`/labels/${labelId}`);
    return response.label;
  },

  /**
   * Update dialogue for a label (Write Mode)
   */
  async updateDialogue(
    labelId: string,
    dialogue: Array<{ speakerId: string | null; text: string }>,
    options?: {
      expectedVersion?: number;
      expectedContentHash?: string;
      menuBlocks?: Array<{
        lineId: string;
        menuOptions: Array<{
          label: string;
          targetLabelId: string;
          targetLabelName: string;
          conditionFlags?: string[];
          effects?: { stats?: Record<string, number> };
        }>;
      }>;
    }
  ): Promise<UpdateDialogueResponse> {
    return await request<UpdateDialogueResponse>(
      `/labels/${labelId}/dialogue`,
      {
        method: "PUT",
        body: JSON.stringify({
          dialogue,
          menuBlocks: options?.menuBlocks,
          expectedVersion: options?.expectedVersion,
          expectedContentHash: options?.expectedContentHash,
        }),
      },
      true // allowConflict: true - handle 409 responses as success with success: false
    );
  },

  /**
   * Get all characters associated with a label
   *
   * NOTE: Character associations are automatically derived from dialogue speakers.
   * This returns characters who have dialogue lines in the label.
   */
  async getLabelCharacters(labelId: string): Promise<LabelCharacter[]> {
    const response = await request<LabelCharactersResponse>(
      `/labels/${labelId}/characters`
    );
    return response.characters;
  },

  /**
   * Create a new label
   */
  async createLabel(data: CreateLabelInput): Promise<PublicLabel> {
    const response = await request<CreateLabelResponse>("/labels", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return response.label;
  },

  /**
   * Update label metadata (title, route, status, visibility)
   */
  async updateLabel(
    labelId: string,
    data: UpdateLabelInput
  ): Promise<PublicLabel> {
    const response = await request<UpdateLabelResponse>(`/labels/${labelId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return response.label;
  },

  /**
   * Soft delete a label (sets deleted_at timestamp)
   */
  async deleteLabel(labelId: string): Promise<void> {
    await requestVoid(`/labels/${labelId}`, {
      method: "DELETE",
    });
  },
};
