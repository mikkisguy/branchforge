import { useState } from "react";
import { StoryPanel } from "@/components/ide-shared";
import {
  FileTree,
  BookmarkTab,
  StatusBar,
  type File,
  ScriptEditor,
} from "@/components/script-mode";

interface ScriptModeProps {
  themeName: string;
}

const files: File[] = [
  { name: "my-project", type: "folder", icon: "" },
  { name: "script.rpy", type: "file" },
  { name: "characters.rpy", type: "file" },
  { name: "choices.rpy", type: "file" },
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
    "",
    '<span class="text-purple-400">define</span> <span class="text-blue-400">p</span> <span class="text-muted-foreground">=</span> <span class="text-purple-400">Character</span><span class="text-muted-foreground">(</span><span class="text-green-400">"Protagonist"</span><span class="text-muted-foreground">)</span>',
  ],
  "choices.rpy": [
    '<span class="text-muted-foreground"># Branching logic</span>',
    '<span class="text-purple-400">label</span> <span class="text-blue-400">ending_a</span><span class="text-muted-foreground">:</span>',
    '    <span class="text-green-400">"She chose with her heart."</span>',
    '    <span class="text-purple-400">return</span>',
  ],
};

export function ScriptMode({ themeName }: ScriptModeProps) {
  const [activeFile, setActiveFile] = useState("script.rpy");

  return (
    <div className="flex-1 flex flex-col pt-16">
      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-4 px-8 pb-4 overflow-visible">
        {/* Sidebar - File Tree */}
        <div className="w-56">
          <StoryPanel className="h-full">
            <button
              className="w-full py-2 px-3 rounded text-sm font-medium mb-4 transition-colors"
              style={{ background: "var(--theme-color)", color: "white" }}
            >
              + New Chapter
            </button>

            <FileTree
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
            <BookmarkTab
              name="script.rpy"
              isActive={activeFile === "script.rpy"}
              onClick={() => setActiveFile("script.rpy")}
            />
            <BookmarkTab
              name="characters.rpy"
              isActive={activeFile === "characters.rpy"}
              onClick={() => setActiveFile("characters.rpy")}
            />
            <BookmarkTab
              name="choices.rpy"
              isActive={activeFile === "choices.rpy"}
              onClick={() => setActiveFile("choices.rpy")}
            />
          </div>

          {/* Editor */}
          <StoryPanel className="flex-1 !mt-0">
            <ScriptEditor
              content={fileContents[activeFile] || []}
              language="Ren'Py"
            />
          </StoryPanel>
        </div>

        {/* Right Panel - Character Reference */}
        <div className="w-64">
          <StoryPanel className="h-full">
            <div className="space-y-4">
              <div
                className="text-center p-4 rounded-lg border border-dashed"
                style={{ borderColor: "var(--theme-border-subtle)" }}
              >
                <div className="text-4xl mb-2"></div>
                <p className="text-sm font-medium">Protagonist</p>
                <p className="text-xs text-muted-foreground">
                  The writer of their own fate
                </p>
              </div>
              <div
                className="text-center p-4 rounded-lg border border-dashed"
                style={{ borderColor: "var(--theme-border-subtle)" }}
              >
                <div className="text-4xl mb-2"></div>
                <p className="text-sm font-medium">Eileen</p>
                <p className="text-xs text-muted-foreground">
                  A mysterious guide
                </p>
              </div>
            </div>

            {/* Branching visualization */}
            <div
              className="mt-6 pt-4 border-t border-dashed"
              style={{ borderColor: "var(--theme-border-subtle)" }}
            >
              <p className="text-s font-display tracking-wider text-muted-foreground mb-3">
                Story Branches
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--theme-color)" }}
                  />
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
      <StatusBar
        lineCount={fileContents[activeFile]?.length || 0}
        language="Ren'Py"
        themeName={themeName}
        projectId="my-project"
        projectName="My Visual Novel"
        gitlabBranch="main"
      />
    </div>
  );
}

