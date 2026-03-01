import { useEffect, useState } from "react";
import { StoryPanel } from "@/components/storybook-ide";
import { Logo } from "@/components/ui/logo";

interface WriteModeProps {
  setMode: (mode: "write" | "script") => void;
}

const welcomeText = "Welcome, writer. Your story awaits...";

export function WriteMode({ setMode }: WriteModeProps) {
  const [dialogueText, setDialogueText] = useState("");

  // Typewriter effect
  useEffect(() => {
    setDialogueText("");
    let i = 0;
    const timer = setInterval(() => {
      if (i <= welcomeText.length) {
        setDialogueText(welcomeText.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-8 pt-20">
      <div className="max-w-2xl w-full space-y-8">
        {/* Title */}
        <div className="text-center space-y-4">
          <Logo />
          <p className="text-xl tracking-widest uppercase text-muted-foreground">
            Visual Novel IDE
          </p>
        </div>

        {/* Dialogue Box */}
        <StoryPanel title="???">
          <div className="text-lg leading-relaxed">
            <span className="text-foreground">
              {dialogueText}
              <span className="animate-pulse">|</span>
            </span>
          </div>
        </StoryPanel>

        {/* Start Button */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setMode("script")}
            className="group relative px-12 py-4 font-display text-lg tracking-widest uppercase transition-all hover:scale-105"
            style={{ background: "var(--theme-color)", color: "white" }}
          >
            <span className="relative z-10">Start Writing</span>
            <div
              className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 transition-opacity"
              style={{ background: "white" }}
            />
          </button>
        </div>

        <div className="text-center pt-8">
          <p className="text-sm text-muted-foreground/60 italic">
            "Every great story begins with a single choice..."
          </p>
        </div>
      </div>
    </div>
  );
}
