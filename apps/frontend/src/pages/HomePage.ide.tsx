import { useState } from "react";
import { useTheme, type ThemePalette } from "@/contexts/ThemeContext";

const themePalettes: { name: string; key: ThemePalette; color: string }[] = [
  { name: "Forest", key: "forest", color: "#40bb82" },
  { name: "Periwinkle", key: "periwinkle", color: "#3d4ac2" },
  { name: "Dark Amethyst", key: "dark-amethyst", color: "#9549b6" },
  { name: "Graphite", key: "graphite", color: "#9ca3af" },
];

// IDE-style icon buttons
function IDEIcon({ children, onClick, active, title }: { children: React.ReactNode; onClick?: () => void; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded transition-all ${
        active ? "text-white" : "text-muted-foreground hover:text-foreground"
      }`}
      style={active ? { background: "var(--theme-color)" } : {}}
    >
      {children}
    </button>
  );
}

// File tree component
function FileTree({ files }: { files: Array<{ name: string; type: "file" | "folder"; children?: Array<{ name: string; type: "file" }> }> }) {
  return (
    <div className="font-mono text-sm">
      {files.map((file, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="text-muted-foreground">
            {file.type === "folder" ? "▸" : "•"}
          </span>
          <span className={file.type === "folder" ? "text-foreground" : "text-muted-foreground"}>
            {file.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// Code editor mock
function CodeEditor() {
  const codeLines = [
    'label start:',
    '    "The story begins here..."',
    '    menu:',
    '        "Follow my heart":',
    '            jump ending_a',
    '        "Be practical":',
    '            jump ending_b',
  ];

  return (
    <div className="font-mono text-sm bg-card/50 rounded p-4 h-full overflow-auto">
      <div className="flex">
        <div className="text-muted-foreground/30 pr-4 select-none border-r border-border/30">
          {codeLines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="pl-4 flex-1">
          {codeLines.map((line, i) => (
            <div key={i} className="py-0.5">
              <span className="text-purple-400">label</span>
              {line.includes(":") && <span className="text-blue-400"> start</span>}
              {line.includes(":") && <span className="text-muted-foreground">:</span>}
              {line.includes('"') && (
                <>
                  <span className="text-muted-foreground">    </span>
                  <span className="text-green-400">"{line.split('"')[1]}"</span>
                </>
              )}
              {line.includes("menu") && (
                <>
                  <span className="text-purple-400"> menu</span>
                  <span className="text-muted-foreground">:</span>
                </>
              )}
              {line.includes("Follow") && (
                <>
                  <span className="text-muted-foreground">        </span>
                  <span className="text-green-400">"Follow my heart"</span>
                  <span className="text-muted-foreground">:</span>
                </>
              )}
              {line.includes("jump") && (
                <>
                  <span className="text-muted-foreground">            </span>
                  <span className="text-purple-400">jump</span>
                  <span className="text-blue-400"> ending_a</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Status bar component
function StatusBar({ lineCount, language }: { lineCount: number; language: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-1 text-xs bg-muted/30 border-t border-border/30 font-mono">
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">{language}</span>
        <span className="text-muted-foreground">UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">Ln {lineCount}, Col 1</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--theme-color)" }} />
          <span className="text-muted-foreground">Ready</span>
        </span>
      </div>
    </div>
  );
}

export default function HomePageIDE() {
  const { theme, setTheme } = useTheme();
  const [activeFile, setActiveFile] = useState("script.rpy");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const files = [
    { name: "my-project", type: "folder" as const, children: [
      { name: "game", type: "folder" as const, children: [
        { name: "script.rpy", type: "file" as const },
        { name: "characters.rpy", type: "file" as const },
      ]},
    ]},
  ];

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Title Bar */}
      <div className="h-8 flex items-center px-4 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-2 font-display text-sm tracking-wide">
          <div className="w-3 h-3 rounded" style={{ background: "var(--theme-color)" }} />
          <span>BranchForge IDE</span>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="h-10 flex items-center px-2 gap-1 bg-card/50 border-b border-border/30">
        <IDEIcon title="New Project">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </IDEIcon>
        <IDEIcon title="Save">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
        </IDEIcon>
        <div className="w-px h-5 bg-border/30 mx-1" />
        <IDEIcon title="Run Project" active={false}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </IDEIcon>
        <IDEIcon title="Stop">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x={6} y={6} width={12} height={12} /></svg>
        </IDEIcon>
        <div className="flex-1" />
        <IDEIcon title="Settings">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </IDEIcon>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <div className="w-12 bg-card/30 border-r border-border/30 flex flex-col items-center py-2 gap-2">
          <IDEIcon active title="Explorer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
          </IDEIcon>
          <IDEIcon title="Search">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </IDEIcon>
          <IDEIcon title="Characters">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </IDEIcon>
          <div className="flex-1" />
          {/* Theme colors in activity bar */}
          <div className="flex flex-col gap-1 pb-2">
            {themePalettes.map((palette) => (
              <button
                key={palette.key}
                onClick={() => setTheme(palette.key)}
                title={palette.name}
                className={`w-4 h-4 rounded transition-all ${theme === palette.key ? "ring-2 ring-white" : "opacity-40 hover:opacity-100"}`}
                style={{ background: palette.color }}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className={`bg-card/20 border-r border-border/30 transition-all ${sidebarCollapsed ? "w-0" : "w-56"}`}>
          {!sidebarCollapsed && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explorer</span>
                <button onClick={() => setSidebarCollapsed(true)} className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                </button>
              </div>

              {/* New Project Button */}
              <button
                className="w-full py-2 px-3 rounded text-sm font-medium mb-4 transition-colors"
                style={{ background: "var(--theme-color)", color: "white" }}
              >
                + New Project
              </button>

              {/* Recent Projects */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recent</div>
                <div className="text-sm py-1 px-2 rounded hover:bg-muted/30 cursor-pointer flex items-center gap-2">
                  <span>📁</span>
                  <span>My First VN</span>
                </div>
                <div className="text-sm py-1 px-2 rounded hover:bg-muted/30 cursor-pointer flex items-center gap-2">
                  <span>📁</span>
                  <span>Demo Project</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className="h-9 flex items-end bg-card/30 border-b border-border/30 px-2">
            <button
              onClick={() => setActiveFile("script.rpy")}
              className={`px-4 py-1.5 text-sm flex items-center gap-2 border-t-2 transition-colors ${
                activeFile === "script.rpy" ? "border-foreground bg-card" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>script.rpy</span>
            </button>
            <button
              onClick={() => setActiveFile("characters.rpy")}
              className={`px-4 py-1.5 text-sm flex items-center gap-2 border-t-2 transition-colors ${
                activeFile === "characters.rpy" ? "border-foreground bg-card" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>characters.rpy</span>
            </button>
          </div>

          {/* Code Editor */}
          <div className="flex-1 p-4 overflow-auto">
            <CodeEditor />
          </div>

          {/* Status Bar */}
          <StatusBar lineCount={7} language="Ren'Py" />
        </div>
      </div>
    </div>
  );
}
