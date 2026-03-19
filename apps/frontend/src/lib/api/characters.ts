/**
 * Characters API Client
 *
 * Client for character management operations.
 */

import { request } from "./client";
import type { Character } from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

export interface DetectedCharacter {
  tag: string;
  name: string | null;
  displayName: string;
  color: string;
  isSpecial: boolean;
  sourceFile: string;
  confidence: number;
}

export interface CharacterConflict {
  tag: string;
  detectedName: string | null;
  existingName: string;
  detectedColor: string;
  existingColor: string;
}

export interface DetectCharactersResponse {
  characters: DetectedCharacter[];
  excludedTags: string[];
  conflicts: CharacterConflict[];
}

export interface ImportCharacter {
  tag: string;
  name: string | null;
  displayName: string;
  color: string;
  isLoveInterest?: boolean;
  routeAffiliation?: string;
}

export interface ImportCharactersRequest {
  characters: ImportCharacter[];
  excludedTags: string[];
  linkToLines: boolean;
}

export interface ImportCharactersResponse {
  characters: Array<{
    id: string;
    tag: string;
    name: string;
    displayName: string;
  }>;
  linked: number;
  unmatched: string[];
}

export type { Character } from "@branchforge/shared";

export interface ListCharactersResponse {
  characters: Character[];
}

export interface GetCharacterResponse {
  character: Character;
}

export interface ProjectSettings {
  excludedCharacterTags: string[];
  autoLinkSpeakers: boolean;
}

export interface ProjectSettingsResponse {
  excludedCharacterTags: string[];
  autoLinkSpeakers: boolean;
}

export interface CreateCharacterBody {
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation?: string;
  isLoveInterest?: boolean;
  dialogueStyle?: string;
  conditionalPrefix?: string;
}

export interface UpdateCharacterBody {
  name?: string;
  displayName?: string;
  color?: string;
  routeAffiliation?: string;
  isLoveInterest?: boolean;
  dialogueStyle?: string;
  conditionalPrefix?: string;
}

// ============================================================================
// Characters API
// ============================================================================

export const charactersApi = {
  /**
   * Detect characters from GitLab RPY files
   */
  async detectCharacters(projectId: string): Promise<DetectCharactersResponse> {
    return await request<DetectCharactersResponse>(
      `/projects/${projectId}/characters/detect`
    );
  },

  /**
   * Import characters after review
   */
  async importCharacters(
    projectId: string,
    data: ImportCharactersRequest
  ): Promise<ImportCharactersResponse> {
    return await request<ImportCharactersResponse>(
      `/projects/${projectId}/characters/import`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  /**
   * List all characters for a project
   */
  async listCharacters(projectId: string): Promise<Character[]> {
    const response = await request<ListCharactersResponse>(
      `/projects/${projectId}/characters`
    );
    return response.characters;
  },

  /**
   * Get a single character by ID
   */
  async getCharacter(characterId: string): Promise<Character> {
    const response = await request<GetCharacterResponse>(
      `/characters/${characterId}`
    );
    return response.character;
  },

  /**
   * Get project settings
   */
  async getProjectSettings(projectId: string): Promise<ProjectSettings> {
    return await request<ProjectSettingsResponse>(
      `/projects/${projectId}/character-settings`
    );
  },

  /**
   * Update project settings
   */
  async updateProjectSettings(
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<ProjectSettings> {
    return await request<ProjectSettingsResponse>(
      `/projects/${projectId}/character-settings`,
      {
        method: "PUT",
        body: JSON.stringify(settings),
      }
    );
  },

  /**
   * Create a new character
   */
  async createCharacter(
    projectId: string,
    body: CreateCharacterBody
  ): Promise<Character> {
    const response = await request<GetCharacterResponse>(
      `/projects/${projectId}/characters`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.character;
  },

  /**
   * Update a character
   */
  async updateCharacter(
    characterId: string,
    body: UpdateCharacterBody
  ): Promise<Character> {
    const response = await request<GetCharacterResponse>(
      `/characters/${characterId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
    return response.character;
  },

  /**
   * Delete a character
   */
  async deleteCharacter(characterId: string): Promise<void> {
    await request(`/characters/${characterId}`, {
      method: "DELETE",
    });
  },

  /**
   * Upload avatar image for a character
   */
  async uploadAvatar(characterId: string, file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append("avatar", file);

    return await request<{ avatarUrl: string }>(
      `/characters/${characterId}/avatar`,
      {
        method: "POST",
        body: formData,
      }
    );
  },

  /**
   * Remove avatar from a character
   */
  async deleteAvatar(characterId: string): Promise<void> {
    await request(`/characters/${characterId}/avatar`, {
      method: "DELETE",
    });
  },
};
