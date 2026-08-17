import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  BookOpen,
  SquarePen,
  Menu,
  Keyboard,
  Settings,
  LogOut,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ProjectSelector } from "./ProjectSelector";
import { NavButtons } from "./NavButtons";
import { DarkModeToggle } from "./DarkModeToggle";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { Project } from "@/lib/api/projects";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { ThemePaletteOption } from "./ThemeSwitcher";

interface SidebarMobileMenuProps {
  mode: "write" | "script";
  setMode: (mode: "write" | "script") => void;
  projectId?: string;
  projects: Project[];
  isLoadingProjects?: boolean;
  setCurrentProject: (project: Project | null) => void;
  isProjectPopoverOpen: boolean;
  onToggleProjectPopover: () => void;
  onCloseProjectPopover: () => void;
  onOpenProjectSettings: () => void;
  onOpenFlow: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
}

/** Mobile bottom navigation bar + hamburger popover menu. */
export function SidebarMobileMenu({
  mode,
  setMode,
  projectId,
  projects,
  isLoadingProjects,
  setCurrentProject,
  isProjectPopoverOpen,
  onToggleProjectPopover,
  onCloseProjectPopover,
  onOpenProjectSettings,
  onOpenFlow,
  onOpenKeyboardShortcuts,
  onOpenSettings,
  onLogout,
  isDarkMode,
  onToggleDarkMode,
  theme,
  setTheme,
  themePalettes,
}: SidebarMobileMenuProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuBtnRef = useRef<HTMLSpanElement>(null);
  const closeMobileMenuEvent = useEffectEvent(() => setMobileMenuOpen(false));

  const openKeyboardShortcutsFromMenu = () => {
    // Focus the persistent hamburger trigger before the menu item unmounts so
    // dialog focus trap can restore focus here on close.
    const menuButton = mobileMenuBtnRef.current?.querySelector("button");
    if (menuButton instanceof HTMLButtonElement) {
      menuButton.focus();
    }
    onOpenKeyboardShortcuts();
    setMobileMenuOpen(false);
  };

  // Click-outside dismiss for mobile hamburger menu popover
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        mobileMenuBtnRef.current &&
        !mobileMenuBtnRef.current.contains(event.target as Node)
      ) {
        closeMobileMenuEvent();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  return (
    <>
      {/* Mobile bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-card/95 backdrop-blur border-t border-border/30 flex items-center justify-center gap-3 px-4 pb-[env(safe-area-inset-bottom)] z-50">
        {/* Mode switcher – horizontal, icon-only */}
        <div className="flex bg-muted/50 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={`p-3.5 rounded-md transition-all ${
              mode === "write"
                ? "text-white bg-[var(--theme-color)]"
                : "text-muted-foreground"
            }`}
            aria-label="Write Mode"
            title="Write Mode"
          >
            <BookOpen className="size-4 flex-shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setMode("script")}
            className={`p-3.5 rounded-md transition-all ${
              mode === "script"
                ? "text-white bg-[var(--theme-color)]"
                : "text-muted-foreground"
            }`}
            aria-label="Script Mode"
            title="Script Mode"
          >
            <SquarePen className="size-4 flex-shrink-0" />
          </button>
        </div>

        <ProjectSelector
          projectId={projectId}
          projects={projects}
          isLoadingProjects={isLoadingProjects}
          setCurrentProject={setCurrentProject}
          isCollapsed={true}
          isOpen={isProjectPopoverOpen}
          onToggle={onToggleProjectPopover}
          onClose={onCloseProjectPopover}
          bottomPopover
        />

        <div className="flex p-0.5">
          <NavButtons
            projectId={projectId}
            isCollapsed={true}
            showLabel={false}
            horizontal
            onOpenProjectSettings={onOpenProjectSettings}
            onOpenFlow={onOpenFlow}
          />
        </div>

        {/* Hamburger menu – replaces dark mode, theme, settings, logout */}
        <span ref={mobileMenuBtnRef}>
          <IconButton
            icon={<Menu className="size-4 flex-shrink-0" />}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            variant="ghost"
            className={`p-3.5 h-auto w-auto rounded-md text-sm font-medium transition-colors ${
              mobileMenuOpen
                ? "text-foreground bg-muted/50"
                : "text-muted-foreground"
            }`}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          />
        </span>
      </div>

      {/* Mobile hamburger menu popover */}
      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="md:hidden fixed bottom-14 left-0 right-0 bg-popover border-t border-border/70 shadow-xl shadow-black/25 ring-1 ring-white/5 z-[100]"
        >
          <div className="flex flex-col">
            <div className="p-2 rounded-md text-sm font-medium text-muted-foreground border-b border-muted/60 transition-colors">
              <DarkModeToggle
                isDarkMode={isDarkMode}
                onToggle={onToggleDarkMode}
                isCollapsed={false}
                showLabel={true}
              />
            </div>

            <div className="p-2 rounded-md text-sm font-medium text-muted-foreground border-b border-muted/60 transition-colors">
              <ThemeSwitcher
                theme={theme}
                setTheme={setTheme}
                themePalettes={themePalettes}
                isCollapsed={false}
                isOpen={false}
                onToggle={() => {}}
                onClose={() => {}}
              />
            </div>

            <div className="p-2 rounded-md text-sm font-medium text-muted-foreground border-b border-muted/60 transition-colors">
              <button
                type="button"
                onClick={openKeyboardShortcutsFromMenu}
                className="flex items-center gap-3 p-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Keyboard shortcuts"
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="size-4 flex-shrink-0" />
                <span>Keyboard shortcuts</span>
              </button>
            </div>

            <div className="p-2 rounded-md text-sm font-medium text-muted-foreground border-b border-muted/60 transition-colors">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSettings();
                }}
                className="flex items-center gap-3 p-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Settings"
              >
                <Settings className="size-4 flex-shrink-0" />
                <span>Settings</span>
              </button>
            </div>

            <div className="p-2 rounded-md text-sm font-medium text-muted-foreground transition-colors">
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-3 p-2 rounded-md text-sm font-medium text-muted-foreground hover:text-destructive-muted hover:bg-destructive/10 transition-colors"
                title="Logout"
              >
                <LogOut className="size-4 flex-shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
