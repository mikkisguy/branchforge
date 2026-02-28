import { useState, useEffect } from "react";
import { useTheme, type ThemePalette } from "@/contexts/ThemeContext";

const themePalettes: { name: string; key: ThemePalette; color: string }[] = [
  { name: "Forest", key: "forest", color: "#40bb82" },
  { name: "Periwinkle", key: "periwinkle", color: "#3d4ac2" },
  { name: "Dark Amethyst", key: "dark-amethyst", color: "#9549b6" },
  { name: "Graphite", key: "graphite", color: "#9ca3af" },
];

// Floating particles for dreamy effect
function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 5,
    duration: Math.random() * 10 + 10,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full opacity-30"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: "var(--theme-color)",
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
          50% { transform: translateY(-30px) translateX(10px); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

// VN-style dialogue box
function DialogueBox({ children, speaker }: { children: React.ReactNode; speaker?: string }) {
  return (
    <div className="relative">
      {/* Decorative corners */}
      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 opacity-60" style={{ borderColor: "var(--theme-color)" }} />
      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 opacity-60" style={{ borderColor: "var(--theme-color)" }} />
      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 opacity-60" style={{ borderColor: "var(--theme-color)" }} />
      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 opacity-60" style={{ borderColor: "var(--theme-color)" }} />

      <div className="bg-card/90 backdrop-blur border border-border/30 p-6 relative">
        {speaker && (
          <div className="absolute -top-3 left-4 px-3 py-1 text-sm font-display tracking-wide" style={{ background: "var(--theme-color)", color: "white" }}>
            {speaker}
          </div>
        )}
        <div className="text-lg leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// Branching path visualization
function BranchingPath() {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-xl text-foreground">Your Story Awaits</h3>
      <div className="flex items-center gap-4 text-sm">
        {/* Chapter */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-display" style={{ background: "var(--theme-color)" }}>
            Ch.1
          </div>
          <div className="h-16 w-0.5 bg-gradient-to-b from-current to-transparent mt-2" style={{ color: "var(--theme-color)" }} />
        </div>

        {/* Branch point */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <div className="h-0.5 w-8 bg-muted-foreground/50" />
            <span className="text-muted-foreground italic">"I'll follow my heart..."</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <div className="h-0.5 w-8 bg-muted-foreground/50" />
            <span className="text-muted-foreground italic">"I must be practical..."</span>
          </div>
        </div>

        {/* Endings */}
        <div className="flex flex-col gap-4">
          <div className="px-3 py-1.5 rounded text-xs border border-dashed" style={{ borderColor: "var(--theme-color)", color: "var(--theme-color)" }}>
            Ending A
          </div>
          <div className="px-3 py-1.5 rounded text-xs border border-dashed" style={{ borderColor: "var(--theme-color)", color: "var(--theme-color)" }}>
            Ending B
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePageVN() {
  const { theme, setTheme } = useTheme();
  const [dialogueText, setDialogueText] = useState("");
  const welcomeText = "Welcome, writer. Your story awaits...";

  // Typewriter effect
  useEffect(() => {
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
    <div className="min-h-screen relative">
      <FloatingParticles />

      <div className="mx-auto max-w-4xl p-8 space-y-8 relative z-10">
        {/* Header - VN Style */}
        <div className="text-center space-y-6">
          <h1 className="font-display text-6xl tracking-wide leading-tight pb-2" style={{ background: "linear-gradient(135deg, var(--theme-color) 0%, white 50%, var(--theme-color) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            BranchForge
          </h1>
          <p className="text-xl tracking-widest uppercase text-muted-foreground">Visual Novel IDE</p>
        </div>

        {/* Main Dialogue */}
        <DialogueBox speaker="???">
          <span className="text-foreground">{dialogueText}<span className="animate-pulse">|</span></span>
        </DialogueBox>

        {/* Character Portrait Placeholder */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-48 h-64 rounded-lg border-2 border-dashed flex items-center justify-center" style={{ borderColor: "var(--theme-color)" }}>
              <div className="text-center space-y-2">
                <div className="text-4xl opacity-30">???</div>
                <p className="text-sm text-muted-foreground">Character Portrait</p>
                <p className="text-xs text-muted-foreground/50">Your protagonist awaits...</p>
              </div>
            </div>
            {/* Sparkles around portrait */}
            <div className="absolute -top-2 -right-2 text-lg animate-pulse" style={{ color: "var(--theme-color)" }}>✦</div>
            <div className="absolute -bottom-2 -left-2 text-lg animate-pulse" style={{ animationDelay: "0.5s", color: "var(--theme-color)" }}>✦</div>
          </div>
        </div>

        {/* Branching Path */}
        <div className="py-8">
          <BranchingPath />
        </div>

        {/* Theme Selection - VN Choice Style */}
        <div className="space-y-4">
          <h3 className="font-display text-lg text-center text-muted-foreground">Choose your color palette...</h3>
          <div className="flex flex-wrap justify-center gap-4">
            {themePalettes.map((palette) => (
              <button
                key={palette.key}
                onClick={() => setTheme(palette.key)}
                className={`relative px-6 py-3 rounded-lg font-display tracking-wide transition-all ${
                  theme === palette.key
                    ? "scale-105 shadow-lg"
                    : "opacity-60 hover:opacity-100"
                }`}
                style={{
                  background: theme === palette.key ? palette.color : "transparent",
                  color: theme === palette.key ? "white" : palette.color,
                  border: `1.5px solid ${palette.color}`,
                }}
              >
                {palette.name}
                {theme === palette.key && <span className="absolute -top-1 -right-1 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Start Button - VN Choice Style */}
        <div className="flex justify-center pt-4">
          <button
            className="group relative px-12 py-4 font-display text-lg tracking-widest uppercase transition-all hover:scale-105"
            style={{ background: "var(--theme-color)", color: "white" }}
          >
            <span className="relative z-10">Start Creating</span>
            <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 transition-opacity" style={{ background: "white" }} />
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pt-8">
          <p className="text-sm text-muted-foreground/60 italic">
            "Every great story begins with a single choice..."
          </p>
        </div>
      </div>
    </div>
  );
}
