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
  const particles = Array.from({ length: 15 }, (_, i) => ({
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
          className="absolute rounded-full opacity-20"
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
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
          50% { transform: translateY(-30px) translateX(10px); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// Storybook-style panel with decorative corners
function StoryPanel({ children, title, className = "" }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Decorative corner flourishes */}
      <div className="absolute -top-1 -left-1 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: "var(--theme-color)", opacity: 0.5 }} />
      <div className="absolute -top-1 -right-1 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: "var(--theme-color)", opacity: 0.5 }} />
      <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: "var(--theme-color)", opacity: 0.5 }} />
      <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: "var(--theme-color)", opacity: 0.5 }} />

      {title && (
        <div className="absolute -top-3 left-6 px-4 py-1 text-sm font-display tracking-wide rounded" style={{ background: "var(--theme-color)", color: "white" }}>
          {title}
        </div>
      )}

      <div className="bg-card/80 backdrop-blur border border-border/30 rounded-lg p-4 h-full">
        {children}
      </div>
    </div>
  );
}

// File tree styled like a book's table of contents
function StorybookFileTree({ files, activeFile, onSelectFile }: {
  files: Array<{ name: string; type: "file" | "folder"; icon?: string }>;
  activeFile: string;
  onSelectFile: (name: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-display tracking-wider text-muted-foreground mb-3 pb-2 border-b border-dashed" style={{ borderColor: "var(--theme-color)" }}>
        📖 Contents
      </div>
      {files.map((file, i) => (
        <button
          key={i}
          onClick={() => file.type === "file" && onSelectFile(file.name)}
          disabled={file.type === "folder"}
          className={`w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-all ${
            file.type === "folder"
              ? "text-foreground/70 cursor-default"
              : activeFile === file.name
                ? "bg-muted/50 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
          }`}
        >
          <span>{file.icon || (file.type === "folder" ? "📁" : "📄")}</span>
          <span className="font-medium">{file.name}</span>
        </button>
      ))}
    </div>
  );
}

// Code editor with storybook styling
function StorybookEditor({ content, language }: { content: string[]; language: string }) {
  return (
    <div className="font-mono text-sm h-full overflow-auto">
      <div className="flex">
        <div className="text-muted-foreground/30 pr-3 py-2 select-none text-right" style={{ minWidth: "2rem" }}>
          {content.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="flex-1 py-2 pl-2 border-l border-dashed" style={{ borderColor: "var(--theme-border-subtle)" }}>
          {content.map((line, i) => (
            <div key={i} className="py-0.5">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Tab styled like a bookmark
function BookmarkTab({ name, isActive, onClick, onClose }: { name: string; isActive: boolean; onClick: () => void; onClose?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 pr-8 font-display text-sm tracking-wide transition-all ${
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      style={{
        background: isActive ? "var(--theme-color)" : "transparent",
        color: isActive ? "white" : undefined,
      }}
    >
      <span className="relative z-10">{name}</span>
      {/* Bookmark tail effect */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-2" style={{ background: "var(--theme-color)", clipPath: "polygon(0 100%, 5% 0, 95% 0, 100% 100%)" }} />
      )}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center hover:bg-white/20"
        >
          ×
        </button>
      )}
    </button>
  );
}

// Status bar styled like a storybook footer
function StorybookStatusBar({ lineCount, language, themeName }: { lineCount: number; language: string; themeName: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs bg-card/90 backdrop-blur border-t border-dashed" style={{ borderColor: "var(--theme-border-subtle)" }}>
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">📜 {language}</span>
        <span className="text-muted-foreground">✨ {themeName}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">Line {lineCount}</span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--theme-color)" }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--theme-color)" }} />
          <span>Ready to write</span>
        </span>
      </div>
    </div>
  );
}

export default function HomePageStorybookIDE() {
  const { theme, setTheme } = useTheme();
  const [mode, setMode] = useState<"story" | "editor">("story");
  const [activeFile, setActiveFile] = useState("script.rpy");
  const [dialogueText, setDialogueText] = useState("");
  const welcomeText = "Welcome, writer. Your story awaits...";

  // Typewriter effect
  useEffect(() => {
    if (mode === "story") {
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
    }
  }, [mode]);

  const files = [
    { name: "my-project", type: "folder" as const, icon: "📚" },
    { name: "script.rpy", type: "file" as const, icon: "📝" },
    { name: "characters.rpy", type: "file" as const, icon: "👥" },
    { name: "choices.rpy", type: "file" as const, icon: "🔀" },
  ];

  const fileContents: Record<string, string[]> = {
    "script.rpy": [
      '<span class="text-purple-400">label</span> <span class="text-blue-400">start</span><span class="text-muted-foreground">:</span>',
      '    <span class="text-green-400">"The story begins here..."</span>',
      '    <span class="text-purple-400">menu</span><span class="text-muted-foreground">:</span>',
      '        <span class="text-green-400">"Follow my heart"</span><span class="text-muted-foreground">:</span>',
      '            <span class="text-purple-400">jump</span> <span class="text-blue-400">ending_a</span>',
    ],
    "characters.rpy": [
      '<span class="text-purple-400">define</span> <span class="text-blue-400">e</span> <span class="text-muted-foreground">=</span> <span class="text-purple-400">Character</span><span class="text-muted-foreground">(</span><span class="text-green-400">"Eileen"</span><span class="text-muted-foreground">)</span>',
      '',
      '<span class="text-purple-400">define</span> <span class="text-blue-400">p</span> <span class="text-muted-foreground">=</span> <span class="text-purple-400">Character</span><span class="text-muted-foreground">(</span><span class="text-green-400">"Protagonist"</span><span class="text-muted-foreground">)</span>',
    ],
    "choices.rpy": [
      '<span class="text-muted-foreground"># Branching logic</span>',
      '<span class="text-purple-400">label</span> <span class="text-blue-400">ending_a</span><span class="text-muted-foreground">:</span>',
      '    <span class="text-green-400">"She chose with her heart."</span>',
      '    <span class="text-purple-400">return</span>',
    ],
  };

  const themeInfo = themePalettes.find(p => p.key === theme);

  return (
    <div className="min-h-screen relative flex flex-col">
      <FloatingParticles />

      {/* Mode Toggle */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-card/90 backdrop-blur border border-border/30 rounded-full p-1 flex gap-1">
          <button
            onClick={() => setMode("story")}
            className={`px-6 py-2 rounded-full text-sm font-display tracking-wide transition-all ${
              mode === "story" ? "text-white" : "text-muted-foreground hover:text-foreground"
            }`}
            style={mode === "story" ? { background: "var(--theme-color)" } : {}}
          >
            📖 Story Mode
          </button>
          <button
            onClick={() => setMode("editor")}
            className={`px-6 py-2 rounded-full text-sm font-display tracking-wide transition-all ${
              mode === "editor" ? "text-white" : "text-muted-foreground hover:text-foreground"
            }`}
            style={mode === "editor" ? { background: "var(--theme-color)" } : {}}
          >
            ✏️ Editor Mode
          </button>
        </div>
      </div>

      {/* Floating theme switcher */}
      <div className="fixed top-4 right-4 z-50">
        <StoryPanel className="!p-3">
          <div className="text-xs text-muted-foreground mb-2 font-display">Colors</div>
          <div className="flex gap-2">
            {themePalettes.map((palette) => (
              <button
                key={palette.key}
                onClick={() => setTheme(palette.key)}
                className={`w-7 h-7 rounded transition-all ${
                  theme === palette.key ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-card" : "opacity-60 hover:opacity-100 hover:scale-105"
                }`}
                style={{ background: palette.color }}
                title={palette.name}
              />
            ))}
          </div>
        </StoryPanel>
      </div>

      {mode === "story" ? (
        // STORY MODE
        <div className="flex-1 flex items-center justify-center p-8 pt-20">
          <div className="max-w-2xl w-full space-y-8">
            {/* Title */}
            <div className="text-center space-y-4">
              <h1 className="font-display text-6xl tracking-wide leading-tight pb-2" style={{
                background: "linear-gradient(135deg, var(--theme-color) 0%, white 50%, var(--theme-color) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>
                BranchForge
              </h1>
              <p className="text-xl tracking-widest uppercase text-muted-foreground">Visual Novel IDE</p>
            </div>

            {/* Dialogue Box */}
            <StoryPanel title="???">
              <div className="text-lg leading-relaxed">
                <span className="text-foreground">{dialogueText}<span className="animate-pulse">|</span></span>
              </div>
            </StoryPanel>

            {/* Start Button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setMode("editor")}
                className="group relative px-12 py-4 font-display text-lg tracking-widest uppercase transition-all hover:scale-105"
                style={{ background: "var(--theme-color)", color: "white" }}
              >
                <span className="relative z-10">Begin Your Story</span>
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 transition-opacity" style={{ background: "white" }} />
              </button>
            </div>

            <div className="text-center pt-8">
              <p className="text-sm text-muted-foreground/60 italic">
                "Every great story begins with a single choice..."
              </p>
            </div>
          </div>
        </div>
      ) : (
        // EDITOR MODE
        <div className="flex-1 flex flex-col pt-16">
          {/* Editor Title */}
          <div className="px-8 pb-4">
            <h1 className="font-display text-3xl tracking-wide" style={{ color: "var(--theme-color)" }}>
              ✏️ Writing Desk
            </h1>
          </div>

          {/* Main Editor Layout */}
          <div className="flex-1 flex gap-4 px-8 pb-4 overflow-hidden">
            {/* Sidebar - File Tree */}
            <div className="w-56">
              <StoryPanel title="Contents" className="h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-display">📚 {themeInfo?.name}</span>
                </div>

                <button
                  className="w-full py-2 px-3 rounded text-sm font-medium mb-4 transition-colors"
                  style={{ background: "var(--theme-color)", color: "white" }}
                >
                  + New Chapter
                </button>

                <StorybookFileTree
                  files={files}
                  activeFile={activeFile}
                  onSelectFile={setActiveFile}
                />
              </StoryPanel>
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col">
              {/* Tabs */}
              <div className="flex items-end mb-0">
                <BookmarkTab name="script.rpy" isActive={activeFile === "script.rpy"} onClick={() => setActiveFile("script.rpy")} />
                <BookmarkTab name="characters.rpy" isActive={activeFile === "characters.rpy"} onClick={() => setActiveFile("characters.rpy")} />
                <BookmarkTab name="choices.rpy" isActive={activeFile === "choices.rpy"} onClick={() => setActiveFile("choices.rpy")} />
              </div>

              {/* Editor */}
              <StoryPanel className="flex-1 !mt-0">
                <StorybookEditor content={fileContents[activeFile] || []} language="Ren'Py" />
              </StoryPanel>
            </div>

            {/* Right Panel - Character Reference */}
            <div className="w-64">
              <StoryPanel title="Characters" className="h-full">
                <div className="space-y-4">
                  <div className="text-center p-4 rounded-lg border border-dashed" style={{ borderColor: "var(--theme-border-subtle)" }}>
                    <div className="text-4xl mb-2">👤</div>
                    <p className="text-sm font-medium">Protagonist</p>
                    <p className="text-xs text-muted-foreground">The writer of their own fate</p>
                  </div>
                  <div className="text-center p-4 rounded-lg border border-dashed" style={{ borderColor: "var(--theme-border-subtle)" }}>
                    <div className="text-4xl mb-2">👩</div>
                    <p className="text-sm font-medium">Eileen</p>
                    <p className="text-xs text-muted-foreground">A mysterious guide</p>
                  </div>
                </div>

                {/* Branching visualization */}
                <div className="mt-6 pt-4 border-t border-dashed" style={{ borderColor: "var(--theme-border-subtle)" }}>
                  <p className="text-xs font-display tracking-wider text-muted-foreground mb-3">🔀 Story Branches</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ background: "var(--theme-color)" }} />
                      <span>ending_a</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                      <span>ending_b</span>
                    </div>
                  </div>
                </div>
              </StoryPanel>
            </div>
          </div>

          {/* Status Bar */}
          <StorybookStatusBar
            lineCount={fileContents[activeFile]?.length || 0}
            language="Ren'Py"
            themeName={themeInfo?.name || ""}
          />
        </div>
      )}
    </div>
  );
}
