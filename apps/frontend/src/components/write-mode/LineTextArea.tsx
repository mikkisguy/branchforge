import { RenderedLine } from "./RenderedLine";
import { WRITE_MODE_COPY } from "@/copy/write-mode";
import type { RenpyToken } from "@/lib/renpy-tags";

interface LineTextAreaProps {
  entry: {
    text: string;
    speakerId: string | null | undefined;
    contentType?: string;
  };
  isFocused: boolean;
  isChoice: boolean;
  isInitialEmptyLine: boolean;
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
  isInitialEmptyLine,
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
              ? isNarrator
                ? "Narration..."
                : "Dialogue..."
              : isInitialEmptyLine
                ? WRITE_MODE_COPY.line.dialoguePlaceholder
                : "Narration..."
        }
        className={`min-h-[2.5rem] w-full resize-none overflow-hidden font-light tracking-normal leading-8 placeholder:text-muted-foreground/70 ${
          isInitialEmptyLine
            ? "rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            : "border-0 bg-transparent p-0 pr-7 outline-none focus-visible:outline-none focus-visible:ring-0"
        } ${
          isInitialEmptyLine || isFocused
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
        // aria-hidden and tabIndex are coordinated: except for the initial
        // empty line, when not focused the textarea is hidden from AT and
        // removed from tab order. It must remain programmatically focusable
        // so the rendered-line overlay can call .focus() to enter edit mode.
        // react-doctor-disable-next-line react-doctor/no-aria-hidden-on-focusable
        aria-hidden={!isInitialEmptyLine && !isFocused}
        tabIndex={isInitialEmptyLine || isFocused ? 0 : -1}
        style={{
          fontSize: "var(--prose-editor-font-size, 16px)",
          fontFamily: "var(--prose-editor-font-family, var(--font-sans))",
          fontStyle: speakerFontStyle,
          color: "hsl(var(--foreground))",
        }}
      />
      {!isInitialEmptyLine && !isFocused && (
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
