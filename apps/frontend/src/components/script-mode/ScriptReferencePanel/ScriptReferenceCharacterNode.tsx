import type { Character } from "@branchforge/shared";
import { cn } from "@/lib/utils";
import { Heart } from "lucide-react";

export interface CharacterNodeProps {
  character: Character;
  failedAvatars: Record<string, boolean>;
  onAvatarError: (characterId: string) => void;
  canEdit: boolean;
  onEdit?: (characterId: string) => void;
}

export function CharacterNode({
  character,
  failedAvatars,
  onAvatarError,
  canEdit,
  onEdit,
}: CharacterNodeProps) {
  const inner = (
    <>
      {/* Avatar: image or colored circle */}
      {character.avatarUrl ? (
        <>
          <img
            src={character.avatarUrl}
            alt={character.displayName}
            className={cn(
              "size-8 rounded-full shrink-0 object-cover",
              failedAvatars[character.id] && "hidden"
            )}
            onError={() => onAvatarError(character.id)}
          />
          {failedAvatars[character.id] && (
            <div
              className="size-8 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0 shadow-sm"
              style={{
                backgroundColor: character.color ?? "var(--theme-color)",
              }}
            >
              {character.displayName[0] || "?"}
            </div>
          )}
        </>
      ) : (
        <div
          className="size-8 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0 shadow-sm"
          style={{
            backgroundColor: character.color ?? "var(--theme-color)",
          }}
        >
          {character.displayName[0] || "?"}
        </div>
      )}

      {/* Name and tag */}
      <div className="min-w-0 flex-1 ml-1.5">
        <p className="text-xs font-medium truncate">{character.displayName}</p>
        <span className="font-mono text-[10px] text-foreground/70 font-semibold">
          {character.renpyTag}
        </span>
      </div>

      {/* Love interest indicator */}
      {character.isLoveInterest && (
        <Heart className="size-2.5 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
      )}
    </>
  );

  if (canEdit && onEdit) {
    return (
      <button
        type="button"
        onClick={() => onEdit(character.id)}
        className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted transition-colors group cursor-pointer w-full text-left"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 p-1.5 rounded-md w-full text-left">
      {inner}
    </div>
  );
}
