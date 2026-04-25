/**
 * Labels API Client
 *
 * Client for label management operations.
 */

import { request } from "./client";

// ============================================================================
// Types (imported from shared package)
// ============================================================================

// Import types from shared package - these match backend response types
import type {
  PublicLabel,
  LabelDetail,
  LabelCharacter,
} from "@branchforge/shared";

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

export interface LabelCharacterResponse {
  character: LabelCharacter;
}

export interface AddCharacterToLabelInput {
  characterId: string;
  notes?: string | null;
}

export interface UpdateCharacterInLabelInput {
  notes?: string | null;
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
    }
  ): Promise<UpdateDialogueResponse> {
    return await request<UpdateDialogueResponse>(
      `/labels/${labelId}/dialogue`,
      {
        method: "PUT",
        body: JSON.stringify({
          dialogue,
          expectedVersion: options?.expectedVersion,
          expectedContentHash: options?.expectedContentHash,
        }),
      },
      true // allowConflict: true - handle 409 responses as success with success: false
    );
  },

  /**
   * Get all characters associated with a label
   */
  async getLabelCharacters(labelId: string): Promise<LabelCharacter[]> {
    const response = await request<LabelCharactersResponse>(
      `/labels/${labelId}/characters`
    );
    return response.characters;
  },

  /**
   * Add a character to a label
   */
  async addCharacterToLabel(
    labelId: string,
    data: AddCharacterToLabelInput
  ): Promise<LabelCharacter> {
    const response = await request<LabelCharacterResponse>(
      `/labels/${labelId}/characters`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    return response.character;
  },

  /**
   * Update a character's association with a label
   */
  async updateCharacterInLabel(
    labelId: string,
    characterId: string,
    data: UpdateCharacterInLabelInput
  ): Promise<LabelCharacter> {
    const response = await request<LabelCharacterResponse>(
      `/labels/${labelId}/characters/${characterId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
    return response.character;
  },

  /**
   * Remove a character from a label
   */
  async removeCharacterFromLabel(
    labelId: string,
    characterId: string
  ): Promise<void> {
    await request(`/labels/${labelId}/characters/${characterId}`, {
      method: "DELETE",
    });
  },
};
