import { ChevronDown, Split } from "lucide-react";
import { withAlpha } from "@/lib/utils";
import type { Character } from "@branchforge/shared";

interface SpeakerDropdownProps {
  isChoice: boolean;
  isStacked: boolean;
  isDropdownOpen: boolean;
  isSpeakerInteractive: boolean;
  character: Character | null | undefined;
  speakerColor: string | undefined;
  isNarrator: boolean;
  speakerFontStyle: "italic" | "normal";
  openUpward: boolean;
  focusedOptionIndex: number;
  dropdownId: string;
  speakerId: string | null | undefined;
  characters: Character[];
  handleSpeakerToggle: () => void;
  handleSpeakerSelect: (speakerId: string | null) => void;
  handleDropdownKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleDropdownBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  dropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  speakerButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function SpeakerDropdown({
  isChoice,
  isStacked,
  isDropdownOpen,
  isSpeakerInteractive,
  character,
  speakerColor,
  isNarrator,
  speakerFontStyle,
  openUpward,
  focusedOptionIndex,
  dropdownId,
  speakerId,
  characters,
  handleSpeakerToggle,
  handleSpeakerSelect,
  handleDropdownKeyDown,
  handleDropdownBlur,
  dropdownRef,
  dropdownMenuRef,
  speakerButtonRef,
}: SpeakerDropdownProps) {
  if (isChoice) {
    return (
      <div className={`relative ${isStacked ? "w-full" : "shrink-0 w-40"}`}>
        <div
          className={`flex items-center gap-1.5 rounded-md transition-all h-8 py-1.5 px-2.5 ${
            isStacked ? "-ml-2.5" : ""
          }`}
          style={{
            fontSize: "var(--prose-editor-font-size, 14px)",
            color: "hsl(var(--muted-foreground))",
            fontStyle: "italic",
          }}
        >
          <Split className="size-3 opacity-50" />
          <span className="truncate text-xs">Choice</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${isStacked ? "w-full" : "shrink-0 w-40"}`}
      ref={dropdownRef}
      onBlur={handleDropdownBlur}
    >
      <button
        ref={speakerButtonRef}
        type="button"
        onClick={handleSpeakerToggle}
        aria-haspopup="listbox"
        aria-expanded={isDropdownOpen}
        aria-controls={dropdownId}
        aria-label={`Change speaker: ${character?.displayName || "Narration"}`}
        className={`flex items-center gap-1.5 rounded-md transition-all border tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          isStacked
            ? "inline-flex max-w-full h-8 py-1.5 px-2.5 -ml-2.5"
            : "inline-flex max-w-full items-start h-auto py-1.5 px-2.5 overflow-hidden"
        }`}
        style={{
          fontSize: "var(--prose-editor-font-size, 14px)",
          backgroundColor: isSpeakerInteractive
            ? speakerId && speakerColor
              ? withAlpha(speakerColor, 8)
              : "hsl(var(--muted) / 0.5)"
            : "transparent",
          borderColor: isSpeakerInteractive
            ? speakerId && speakerColor
              ? withAlpha(speakerColor, 25)
              : "hsl(var(--border))"
            : "transparent",
          color:
            speakerId && speakerColor
              ? isNarrator
                ? "hsl(var(--muted-foreground))"
                : speakerColor
              : "hsl(var(--muted-foreground))",
          fontStyle: speakerFontStyle,
        }}
        title={
          speakerId
            ? character?.displayName || "Character dialogue"
            : "Narration"
        }
      >
        <span className="truncate">
          {character?.displayName || "Narration"}
        </span>
        <ChevronDown
          className={`size-3 transition-transform duration-200 flex-shrink-0 ${
            isDropdownOpen ? "rotate-180" : ""
          }`}
          style={{ opacity: isSpeakerInteractive ? 0.5 : 0 }}
        />
      </button>

      {isDropdownOpen && (
        <div
          ref={dropdownMenuRef}
          id={dropdownId}
          // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
          role="listbox"
          aria-label="Select speaker"
          aria-activedescendant={
            focusedOptionIndex >= 0
              ? `${dropdownId}-option-${focusedOptionIndex}`
              : undefined
          }
          onKeyDown={handleDropdownKeyDown}
          tabIndex={0}
          className={`absolute z-50 bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 py-1 min-w-[160px] max-sm:min-w-0 max-sm:w-[min(280px,90vw)] max-h-[280px] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] animate-in fade-in-0 zoom-in-95 duration-200 ease-out ${
            openUpward ? "bottom-full mb-1" : "top-full mt-1"
          } ${
            openUpward ? "slide-in-from-bottom-1" : "slide-in-from-top-1"
          } ${isStacked ? "-left-2.5" : "left-0"}`}
        >
          <button
            id={`${dropdownId}-option-0`}
            type="button"
            role="option"
            aria-selected={!speakerId}
            onClick={() => handleSpeakerSelect(null)}
            tabIndex={-1}
            className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150 ${
              focusedOptionIndex === 0 ? "bg-muted" : "hover:bg-muted"
            }`}
            style={{
              fontStyle: "italic",
              fontWeight: !speakerId ? "600" : "normal",
            }}
          >
            Narration
          </button>

          <hr className="my-1 border-t border-border" />

          {characters.map((char, idx) => (
            <button
              key={char.id}
              id={`${dropdownId}-option-${idx + 1}`}
              type="button"
              role="option"
              aria-selected={speakerId === char.id}
              onClick={() => handleSpeakerSelect(char.id)}
              tabIndex={-1}
              className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150 flex items-center gap-2 ${
                focusedOptionIndex === idx + 1 ? "bg-muted" : "hover:bg-muted"
              }`}
              style={{
                color: speakerId === char.id ? char.color : undefined,
                fontWeight: speakerId === char.id ? "600" : "normal",
              }}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: char.color }}
              />
              <span>{char.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
