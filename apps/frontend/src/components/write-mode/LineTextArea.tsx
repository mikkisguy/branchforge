import { RenderedLine } from "./RenderedLine";
import type { RenpyToken } from "@/lib/renpy-tags";

interface LineTextAreaProps {
  entry: {
    text: string;
    speakerId: string | null | undefined;
    contentType?: string;
  };
  isFocused: boolean;
  isChoice: boolean;
  isStacked: boolean;
  speakerFontStyle: "italic" | "normal";
  renderedTokens: RenpyToken[];
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
  internalTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleRenderedLineClick: (e: React.MouseEvent<HTMLElement>) => void;
  setIsFocused: (focused: boolean) => void;
}

export function LineTextArea({
  entry,
  isFocused,
  isChoice,
  isStacked,
  speakerFontStyle,
  renderedTokens,
  textareaRef,
  internalTextareaRef,
  handleTextChange,
  handleKeyDown,
  handleRenderedLineClick,
  setIsFocused,
}: LineTextAreaProps) {
  return (
    <div className={`relative ${isStacked ? "w-full" : "flex-1"}`}>
      <textarea
        ref={(el) => {
          internalTextareaRef.current = el;
          if (textareaRef) textareaRef(el);
        }}
        defaultValue={entry.text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={
          isChoice
            ? "Choice text..."
            : entry.speakerId
              ? "Dialogue..."
              : "Narration..."
        }
        className={`min-h-[2.5rem] w-full p-0 pr-7 resize-none overflow-hidden bg-transparent border-0 outline-none focus-visible:outline-none focus-visible:ring-0 font-light tracking-normal leading-8 placeholder:text-muted-foreground/70 ${
          isFocused
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-label={
          isChoice
            ? "Choice text"
            : entry.speakerId
              ? "Dialogue text"
              : "Narration text"
        }
        // aria-hidden and tabIndex are coordinated: when not focused the
        // textarea is hidden from AT AND removed from tab order (tabIndex=-1),
        // yet must stay programmatically focusable so the rendered-line
        // overlay's click handler can call .focus() to enter edit mode.
        // react-doctor-disable-next-line react-doctor/no-aria-hidden-on-focusable
        aria-hidden={!isFocused}
        tabIndex={isFocused ? 0 : -1}
        style={{
          fontSize: "var(--prose-editor-font-size, 16px)",
          fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
          fontStyle: speakerFontStyle,
          color: "hsl(var(--foreground))",
        }}
      />
      {!isFocused && (
        <button
          type="button"
          onClick={handleRenderedLineClick}
          data-rendered-line-wrapper="true"
          aria-label={
            isChoice
              ? "Edit choice text"
              : entry.speakerId
                ? "Edit dialogue text"
                : "Edit narration text"
          }
          className="absolute inset-0 pr-7 cursor-text leading-8 text-left bg-transparent border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm overflow-hidden inline-flex items-start"
          style={{
            fontSize: "var(--prose-editor-font-size, 16px)",
            fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
            fontStyle: speakerFontStyle,
            color: "hsl(var(--foreground))",
          }}
        >
          <RenderedLine
            tokens={renderedTokens}
            className="font-light tracking-normal leading-8"
          />
        </button>
      )}
    </div>
  );
}
