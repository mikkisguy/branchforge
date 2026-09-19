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
  isNarrator: boolean;
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
  isNarrator,
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
  const isEmpty = entry.text.length === 0;
  const placeholder = isChoice
    ? "Choice text..."
    : entry.speakerId
      ? isNarrator
        ? "Narration..."
        : "Dialogue..."
      : "Narration...";
  const editLabel = isChoice
    ? "Edit choice text"
    : entry.speakerId
      ? "Edit dialogue text"
      : "Edit narration text";

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
        placeholder={placeholder}
        className={`min-h-[2.5rem] w-full resize-none overflow-hidden border-0 bg-transparent p-0 pr-7 font-light tracking-normal leading-8 placeholder:text-muted-foreground/70 outline-none focus-visible:outline-none focus-visible:ring-0 ${
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
        // The textarea is an editing surface; the rendered-line button is the
        // stable, keyboard-accessible entry point while the row is blurred.
        // It remains programmatically focusable so that button can enter edit
        // mode without a layout change.
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
          aria-label={editLabel}
          className="absolute inset-0 pr-7 cursor-text leading-8 text-left bg-transparent border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm overflow-hidden inline-flex items-start"
          style={{
            fontSize: "var(--prose-editor-font-size, 16px)",
            fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
            fontStyle: speakerFontStyle,
            color: "hsl(var(--foreground))",
          }}
        >
          {isEmpty ? (
            <span className="font-light tracking-normal leading-8 text-muted-foreground/70">
              {placeholder}
            </span>
          ) : (
            <RenderedLine
              tokens={renderedTokens}
              className="font-light tracking-normal leading-8"
            />
          )}
        </button>
      )}
    </div>
  );
}
