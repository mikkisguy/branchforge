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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

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
      {/* react-doctor-disable-next-line react-doctor/no-static-element-interactions */}
      <div
        className={`size-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm hover:ring-2 hover:ring-ring transition-all ${
          onClick ? "cursor-pointer" : "cursor-default"
        }`}
        style={{ backgroundColor: character.color }}
        aria-label={
          character.isLoveInterest
            ? `${character.displayName} (love interest)`
            : character.displayName
        }
        onClick={onClick}
        onKeyDown={onClick ? handleKeyDown : undefined}
        {...(onClick && { role: "button", tabIndex: 0 })}
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
    </Tooltip>
  );
}
