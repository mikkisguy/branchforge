import { useTheme, type ThemePalette } from "@/contexts/ThemeContext";

const themePalettes: { name: string; key: ThemePalette; color: string }[] = [
  { name: "Forest", key: "forest", color: "#40bb82" },
  { name: "Periwinkle", key: "periwinkle", color: "#3d4ac2" },
  { name: "Dark Amethyst", key: "dark-amethyst", color: "#9549b6" },
  { name: "Graphite", key: "graphite", color: "#9ca3af" },
];

// Angled card component
function AngledCard({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative transform -skew-x-6 ${className}`}
      style={style}
    >
      <div className="transform skew-x-6">
        {children}
      </div>
    </div>
  );
}

export default function HomePageAsymmetric() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Diagonal theme accent stripe */}
      <div
        className="absolute top-0 right-0 w-1/2 h-full origin-top transform rotate-12 opacity-20"
        style={{ background: `linear-gradient(135deg, var(--theme-color) 0%, transparent 70%)` }}
      />

      {/* Floating theme switcher */}
      <div className="fixed top-6 right-6 z-50">
        <div className="bg-card/90 backdrop-blur border border-border/30 rounded-lg p-3 shadow-xl">
          <div className="text-xs text-muted-foreground mb-2 font-medium">Theme</div>
          <div className="flex gap-2">
            {themePalettes.map((palette) => (
              <button
                key={palette.key}
                onClick={() => setTheme(palette.key)}
                className={`w-8 h-8 rounded transition-all ${
                  theme === palette.key ? "scale-110 ring-2 ring-white" : "opacity-60 hover:opacity-100 hover:scale-105"
                }`}
                style={{ background: palette.color }}
                title={palette.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 min-h-screen p-8">
        {/* Off-center title - breaking alignment */}
        <div className="ml-8 mb-16">
          <h1 className="font-display text-7xl tracking-tight leading-tight pb-3" style={{ transform: "rotate(-2deg)" }}>
            BranchForge
          </h1>
          <p className="text-xl text-muted-foreground ml-4 mt-2" style={{ transform: "rotate(-1deg)" }}>
              Visual Novel IDE
            </p>
        </div>

        {/* Asymmetric card layout */}
        <div className="relative" style={{ height: "600px" }}>
          {/* Large hero card - breaking alignment on left */}
          <div
            className="absolute left-8 top-0 w-96 h-80 bg-card/80 backdrop-blur border border-border/30 rounded-2xl p-8 shadow-2xl"
            style={{ transform: "rotate(-3deg)", zIndex: 1 }}
          >
            <div className="h-full flex flex-col">
              <div className="flex-1">
                <div className="w-16 h-16 rounded-xl mb-4 flex items-center justify-center" style={{ background: "var(--theme-color)" }}>
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h2 className="text-3xl font-display mb-2">Create</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Build immersive visual novels with an intuitive interface designed for storytellers.
                </p>
              </div>
            </div>
          </div>

          {/* Medium overlapping card - middle right */}
          <div
            className="absolute left-72 top-48 w-80 h-64 bg-card/90 backdrop-blur border border-border/30 rounded-xl p-6 shadow-xl"
            style={{ transform: "rotate(2deg)", zIndex: 2 }}
          >
            <div className="h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-display">Quick Start</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Jump right in with templates or start from scratch. Your workflow, your way.
                </p>
              </div>

              {/* Angled button */}
              <AngledCard>
                <button
                  className="px-6 py-3 text-white font-medium tracking-wide transition-transform hover:scale-105 active:scale-95"
                  style={{ background: "var(--theme-color)" }}
                >
                  New Project →
                </button>
              </AngledCard>
            </div>
          </div>

          {/* Small feature cards - scattered bottom */}
          <div
            className="absolute left-8 bottom-0 w-72 h-40 bg-card/70 backdrop-blur border border-border/30 rounded-lg p-5 shadow-lg"
            style={{ transform: "rotate(1deg)", zIndex: 3 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "var(--theme-color)", opacity: 0.2 }}>
                <svg className="w-6 h-6" style={{ color: "var(--theme-color)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h4 className="font-medium">Script Editor</h4>
                <p className="text-sm text-muted-foreground">Ren'Py syntax highlighting</p>
              </div>
            </div>
          </div>

          {/* Another small card - far right */}
          <div
            className="absolute right-16 top-32 w-64 h-48 bg-card/60 backdrop-blur border border-border/30 rounded-lg p-5 shadow-lg"
            style={{ transform: "rotate(-4deg)", zIndex: 0 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h4 className="font-medium">Characters</h4>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Design and manage your cast with visual character sheets.
            </p>
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted" />
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted" />
              <div className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs" style={{ background: "var(--theme-color)", color: "white" }}>
                +
              </div>
            </div>
          </div>

          {/* Vertical accent card */}
          <div
            className="absolute right-8 bottom-8 w-20 h-64 rounded-full"
            style={{ background: "var(--theme-color)", opacity: 0.1, zIndex: 0 }}
          />
        </div>

        {/* Diagonal section divider */}
        <div className="relative h-px my-16" style={{ background: "linear-gradient(90deg, transparent 0%, var(--theme-color) 50%, transparent 100%)" }} />

        {/* Features section - asymmetric layout */}
        <div className="grid grid-cols-3 gap-8 px-8">
          <div className="col-span-1" />
          <div className="col-span-2 space-y-6">
            <h2 className="text-3xl font-display">Everything you need</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border/20 bg-card/30">
                <h3 className="font-medium mb-1">Preview Mode</h3>
                <p className="text-sm text-muted-foreground">Test your story in real-time</p>
              </div>
              <div className="p-4 rounded-lg border border-border/20 bg-card/30">
                <h3 className="font-medium mb-1">Export</h3>
                <p className="text-sm text-muted-foreground">Build for all platforms</p>
              </div>
              <div className="p-4 rounded-lg border border-border/20 bg-card/30">
                <h3 className="font-medium mb-1">Templates</h3>
                <p className="text-sm text-muted-foreground">Start faster</p>
              </div>
              <div className="p-4 rounded-lg border border-border/20 bg-card/30">
                <h3 className="font-medium mb-1">Cloud Sync</h3>
                <p className="text-sm text-muted-foreground">Work anywhere</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
