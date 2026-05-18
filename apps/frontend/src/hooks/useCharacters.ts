/**
 * useCharacters Hook
 *
 * Provides character state and operations using TanStack Query.
 * Characters are NPCs and love interests in the visual novel.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { charactersApi } from "@/lib/api/characters";
import { characterKeys } from "@/lib/query-keys";
import { useToast } from "@/contexts/ToastContext";
import type { Character } from "@branchforge/shared";
import {
  AVATAR_MAX_SIZE,
  AVATAR_MAX_SIZE_MB,
  isValidAvatarMimeType,
} from "@branchforge/shared";

// ============================================================================
// Types
// ============================================================================

interface CreateCharacterInput {
  name: string;
  displayName: string;
  renpyTag: string;
  color: string;
  routeAffiliation?: string;
  isLoveInterest?: boolean;
  dialogueStyle?: string;
  conditionalPrefix?: string;
}

interface UpdateCharacterInput {
  name?: string;
  displayName?: string;
  color?: string;
  routeAffiliation?: string;
  isLoveInterest?: boolean;
  dialogueStyle?: string;
  conditionalPrefix?: string;
}

export interface UseCharactersReturn {
  // State
  characters: Character[];
  isLoadingCharacters: boolean;
  charactersError: Error | null;

  // Mutation states
  isCreatingCharacter: boolean;
  isUpdatingCharacter: boolean;
  isDeletingCharacter: boolean;
  isUploadingAvatar: boolean;
  isDeletingAvatar: boolean;

  // Methods
  refreshCharacters: () => Promise<unknown>;
  createCharacter: (input: CreateCharacterInput) => Promise<Character>;
  updateCharacter: (
    characterId: string,
    input: UpdateCharacterInput
  ) => Promise<Character>;
  deleteCharacter: (characterId: string) => Promise<void>;
  uploadAvatar: (
    characterId: string,
    file: File
  ) => Promise<{ avatarUrl: string }>;
  deleteAvatar: (characterId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useCharacters(
  projectId: string,
  options?: { enabled?: boolean }
): UseCharactersReturn {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Query for characters (only when projectId is provided)
  const {
    data: characters = [],
    isLoading: isLoadingCharacters,
    error: charactersError,
    refetch: refreshCharacters,
  } = useQuery({
    queryKey: characterKeys.lists(projectId),
    queryFn: async () => {
      return charactersApi.listCharacters(projectId);
    },
    enabled:
      options?.enabled !== undefined
        ? options.enabled && !!projectId
        : !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create character mutation
  const createCharacterMutation = useMutation({
    mutationFn: async (input: CreateCharacterInput) => {
      return charactersApi.createCharacter(projectId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch characters list
      queryClient.invalidateQueries({
        queryKey: characterKeys.lists(projectId),
      });
      toast.success("Character created successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create character: ${error.message}`, "Error");
    },
  });

  // Update character mutation
  const updateCharacterMutation = useMutation({
    mutationFn: async ({
      characterId,
      input,
    }: {
      characterId: string;
      input: UpdateCharacterInput;
    }) => {
      return charactersApi.updateCharacter(characterId, input);
    },
    onSuccess: () => {
      // Invalidate and refetch characters list
      queryClient.invalidateQueries({
        queryKey: characterKeys.lists(projectId),
      });
      toast.success("Character updated successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update character: ${error.message}`, "Error");
    },
  });

  // Delete character mutation
  const deleteCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      await charactersApi.deleteCharacter(characterId);
    },
    onSuccess: () => {
      // Invalidate and refetch characters list
      queryClient.invalidateQueries({
        queryKey: characterKeys.lists(projectId),
      });
      toast.success("Character deleted successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete character: ${error.message}`, "Error");
    },
  });

  // Upload avatar mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async ({
      characterId,
      file,
    }: {
      characterId: string;
      file: File;
    }) => {
      // Client-side validation before upload (must match backend limits from shared package)
      if (!isValidAvatarMimeType(file.type)) {
        throw new Error(
          `Invalid file type. Please upload a PNG, JPEG, WebP, or GIF image.`
        );
      }

      if (file.size > AVATAR_MAX_SIZE) {
        throw new Error(
          `File size exceeds ${AVATAR_MAX_SIZE_MB}MB limit. Please choose a smaller image.`
        );
      }

      return charactersApi.uploadAvatar(characterId, file);
    },
    onSuccess: () => {
      // Invalidate and refetch characters list
      queryClient.invalidateQueries({
        queryKey: characterKeys.lists(projectId),
      });
      toast.success("Avatar uploaded successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to upload avatar: ${error.message}`, "Error");
    },
  });

  // Delete avatar mutation
  const deleteAvatarMutation = useMutation({
    mutationFn: async (characterId: string) => {
      await charactersApi.deleteAvatar(characterId);
    },
    onSuccess: () => {
      // Invalidate and refetch characters list
      queryClient.invalidateQueries({
        queryKey: characterKeys.lists(projectId),
      });
      toast.success("Avatar removed successfully", "Success");
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove avatar: ${error.message}`, "Error");
    },
  });

  // Create character method
  const createCharacter = async (
    input: CreateCharacterInput
  ): Promise<Character> => {
    return createCharacterMutation.mutateAsync(input);
  };

  // Update character method
  const updateCharacter = async (
    characterId: string,
    input: UpdateCharacterInput
  ): Promise<Character> => {
    return updateCharacterMutation.mutateAsync({ characterId, input });
  };

  // Delete character method
  const deleteCharacter = async (characterId: string): Promise<void> => {
    return deleteCharacterMutation.mutateAsync(characterId);
  };

  // Upload avatar method
  const uploadAvatar = async (
    characterId: string,
    file: File
  ): Promise<{ avatarUrl: string }> => {
    return uploadAvatarMutation.mutateAsync({ characterId, file });
  };

  // Delete avatar method
  const deleteAvatar = async (characterId: string): Promise<void> => {
    return deleteAvatarMutation.mutateAsync(characterId);
  };

  return {
    characters,
    isLoadingCharacters,
    charactersError: charactersError as Error | null,
    isCreatingCharacter: createCharacterMutation.isPending,
    isUpdatingCharacter: updateCharacterMutation.isPending,
    isDeletingCharacter: deleteCharacterMutation.isPending,
    isUploadingAvatar: uploadAvatarMutation.isPending,
    isDeletingAvatar: deleteAvatarMutation.isPending,
    refreshCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    uploadAvatar,
    deleteAvatar,
  };
}
