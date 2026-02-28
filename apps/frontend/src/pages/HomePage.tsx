import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme, type ThemePalette } from "@/contexts/ThemeContext";

const themePalettes: { name: string; key: ThemePalette; description: string; color: string }[] = [
  { name: "Forest", key: "forest", description: "Natural greens", color: "#40bb82" },
  { name: "Periwinkle", key: "periwinkle", description: "Dreamy purple-blues", color: "#3d4ac2" },
  { name: "Dark Amethyst", key: "dark-amethyst", description: "Rich purples", color: "#9549b6" },
  { name: "Graphite", key: "graphite", description: "Neutral greys", color: "#888888" },
];

// Helper function to get theme palette info
function getThemeInfo(theme: ThemePalette) {
  return themePalettes.find(p => p.key === theme);
}

function ThemeSwatch({ theme, isActive, onClick }: { theme: ThemePalette; isActive: boolean; onClick: () => void }) {
  const palette = getThemeInfo(theme)!;
  // Generate class name dynamically from theme key
  const colorClass = `bg-${theme}-500`;

  return (
    <button
      onClick={onClick}
      className={`relative h-10 w-10 rounded-lg transition-all duration-200 ${
        isActive ? "ring-2 ring-primary scale-110 shadow-lg" : "opacity-60 hover:opacity-100"
      } ${colorClass}`}
      title={palette.name}
    >
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center">
          <svg className="w-5 h-5 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
    </button>
  );
}

export default function HomePage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl p-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="font-display text-5xl tracking-tight text-foreground">
            BranchForge
          </h1>
          <p className="text-xl text-muted-foreground">
            Visual Novel IDE for Ren'Py
          </p>
        </div>

        {/* Theme Switcher */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Select a color theme for BranchForge</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              {themePalettes.map((palette) => (
                <div key={palette.key} className="flex flex-col items-center gap-2">
                  <ThemeSwatch
                    theme={palette.key}
                    isActive={theme === palette.key}
                    onClick={() => setTheme(palette.key)}
                  />
                  <span className="text-xs text-muted-foreground">{palette.name}</span>
                </div>
              ))}
            </div>

            {/* Theme description */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{getThemeInfo(theme)?.name}</span>
                {" — "}{getThemeInfo(theme)?.description}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Component Demo */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Components</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Buttons */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Buttons</CardTitle>
                <CardDescription className="text-sm">Using theme color</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full text-white"
                  style={{ backgroundColor: "var(--theme-color)" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--theme-color-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--theme-color)"}
                >
                  Primary
                </Button>
                <Button variant="secondary" className="w-full">Secondary</Button>
                <Button variant="outline" className="w-full border-border/50">Outline</Button>
                <Button variant="ghost" className="w-full">Ghost</Button>
              </CardContent>
            </Card>

            {/* Inputs */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Input</CardTitle>
                <CardDescription className="text-sm">Text entry field</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input placeholder="Project name..." className="border-input" />
                <Input placeholder="Author..." className="border-input" />
              </CardContent>
            </Card>

            {/* Status */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status</CardTitle>
                <CardDescription className="text-sm">System ready</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "var(--theme-color)" }} />
                  <span className="text-muted-foreground">Theme active</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--theme-color)", opacity: 0.5 }} />
                  <span className="text-muted-foreground">All systems operational</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-border/30">
          <p className="text-sm text-muted-foreground">
            Built with React 19, Vite, and shadcn/ui
          </p>
        </div>
      </div>
    </div>
  );
}
