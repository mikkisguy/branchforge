import { useEffect, useEffectEvent, useRef } from "react";
import { FolderOpen } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { Project } from "@/lib/api/projects";

interface ProjectSelectorProps {
  projectId?: string;
  projects: Project[];
  isLoadingProjects?: boolean;
  setCurrentProject: (project: Project | null) => void;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** When true, popover opens as a full-width panel from the bottom (for mobile bottom bar) */
  bottomPopover?: boolean;
}

/** Project picker. When collapsed, a button that opens a popover.
 *  When expanded, a native Select. Click-outside dismisses the popover. */
export function ProjectSelector({
  projectId,
  projects,
  isLoadingProjects,
  setCurrentProject,
  isCollapsed,
  isOpen,
  onToggle,
  onClose,
  bottomPopover = false,
}: ProjectSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `onClose` is read inside the click-outside handler but isn't
  // part of the effect's subscription surface — wrap it in
  // `useEffectEvent` so the listener isn't re-bound on every
  // parent render (React 19+).
  const onCloseEffect = useEffectEvent(onClose);

  useEffect(() => {
    // The popover is only rendered in the collapsed branch below;
    // expanded mode shows a native <Select> which manages its own
    // open/close state. So we only need the click-outside handler
    // when `isOpen` is true — the `isCollapsed` check is unnecessary
    // (it was inverted, registering the handler only in the mode
    // that has no popover to dismiss).
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onCloseEffect();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (isCollapsed) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={onToggle}
          disabled={isLoadingProjects}
          className={`flex items-center justify-center p-3.5 rounded-md text-sm font-medium transition-colors ${
            isOpen
              ? "text-foreground bg-muted/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          title="Select Project"
          aria-label="Select Project"
        >
          <FolderOpen className="size-4 flex-shrink-0" />
        </button>
        {isOpen && (
          <div
            className={`${
              bottomPopover
                ? "fixed bottom-14 left-0 right-0 bg-popover border-t border-border/70 shadow-xl shadow-black/25 ring-1 ring-white/5 z-[100] md:hidden"
                : "absolute bg-popover border border-border/70 rounded-lg shadow-xl shadow-black/25 ring-1 ring-white/5 min-w-[300px] max-w-[400px] z-50 left-full top-0 ml-2"
            }`}
          >
            {bottomPopover ? (
              <div className="p-2 max-h-[400px] overflow-y-auto">
                {isLoadingProjects ? (
                  <div className="p-2 border-b border-muted/60">
                    <div className="p-3 text-sm text-muted-foreground">
                      Loading…
                    </div>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="p-2 border-b border-muted/60">
                    <div className="p-3 text-sm text-muted-foreground">
                      No projects found. Create a new project to get started.
                    </div>
                  </div>
                ) : (
                  projects.map((project) => (
                    <div
                      key={project.id}
                      className="p-2 border-b border-muted/60 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentProject(project);
                          onClose();
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left transition-colors ${
                          projectId === project.id
                            ? "text-foreground bg-muted/50"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <FolderOpen className="size-4 flex-shrink-0" />
                        {project.name}
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-2 max-h-[400px] overflow-y-auto">
                {isLoadingProjects ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : projects.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No projects found. Create a new project to get started.
                  </div>
                ) : (
                  projects.map((project) => (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => {
                        setCurrentProject(project);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                        projectId === project.id
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {project.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <Select
        value={projectId ?? undefined}
        aria-label="Select Project"
        onChange={(selectedProjectId) => {
          const project = projects.find((p) => p.id === selectedProjectId);
          if (project) setCurrentProject(project);
        }}
        disabled={isLoadingProjects || projects.length === 0}
        placeholder={
          isLoadingProjects
            ? "Loading…"
            : projects.length === 0
              ? "No projects"
              : "Select project"
        }
        options={projects.map((p) => ({
          value: p.id,
          label: p.name,
        }))}
      />
    </div>
  );
}
