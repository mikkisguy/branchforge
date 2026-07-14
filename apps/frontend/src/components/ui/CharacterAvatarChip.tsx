import { Tooltip } from "@/components/ui/tooltip";
import type { Character } from "@branchforge/shared";

interface CharacterAvatarChipProps {
  character: Character;
  onClick?: () => void;
}

export function CharacterAvatarChip({
  character,
  onClick,
}: CharacterAvatarChipProps) {
  return (
    <Tooltip
      content={
        <span>
          {character.displayName}
          {character.isLoveInterest && (
            <>
              {" "}
              <span aria-hidden="true">♥</span>
              <span className="sr-only">(love interest)</span>
            </>
          )}
        </span>
      }
    >
      {onClick ? (
        <button
          type="button"
          className={`size-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm hover:ring-2 hover:ring-ring transition-all cursor-pointer border-0 p-0 focus-ring`}
          style={{ backgroundColor: character.color }}
          aria-label={
            character.isLoveInterest
              ? `${character.displayName} (love interest)`
              : character.displayName
          }
          onClick={onClick}
        >
          {character.avatarUrl ? (
            <img
              src={character.avatarUrl}
              alt={character.displayName}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            character.displayName[0] || "?"
          )}
        </button>
      ) : (
        <div
          className="size-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm cursor-default"
          style={{ backgroundColor: character.color }}
          aria-label={
            character.isLoveInterest
              ? `${character.displayName} (love interest)`
              : character.displayName
          }
        >
          {character.avatarUrl ? (
            <img
              src={character.avatarUrl}
              alt={character.displayName}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            character.displayName[0] || "?"
          )}
        </div>
      )}
    </Tooltip>
  );
}
