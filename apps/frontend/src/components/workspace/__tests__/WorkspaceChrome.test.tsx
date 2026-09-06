/**
 * WorkspaceChrome Tests
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/contexts/ToastContext";
import { WorkspaceChrome } from "../WorkspaceChrome";
import type { Project } from "@/lib/api/projects";
import type { ThemePalette } from "@branchforge/shared";
import type { ReactNode } from "react";

const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "Test Project",
    source: "ZIP",
    duoEndingEnabled: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

const themePalettes = [
  { name: "Periwinkle", key: "periwinkle" as ThemePalette, color: "#5b6ae0" },
  { name: "Forest", key: "forest" as ThemePalette, color: "#26714e" },
  {
    name: "Dark Amethyst",
    key: "dark-amethyst" as ThemePalette,
    color: "#9549b6",
  },
  { name: "Graphite", key: "graphite" as ThemePalette, color: "#686a71" },
];

const defaultProps = {
  view: "write" as const,
  setView: vi.fn(),
  theme: "periwinkle",
  setTheme: vi.fn(),
  themePalettes,
  isDarkMode: true,
  onToggleDarkMode: vi.fn(),
  onLogout: vi.fn(),
  projectId: "proj-1",
  projects: mockProjects,
  setCurrentProject: vi.fn(),
  isLoadingProjects: false,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

describe("WorkspaceChrome", () => {
  it("view switcher has Write, Script, Flow buttons with aria-labels", () => {
    render(<WorkspaceChrome {...defaultProps} />, { wrapper: createWrapper() });

    expect(
      screen.getAllByRole("button", { name: "Write" }).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("button", { name: "Script" }).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("button", { name: "Flow" }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("clicking Flow calls setView with flow", async () => {
    const user = userEvent.setup();
    const setView = vi.fn();

    render(<WorkspaceChrome {...defaultProps} setView={setView} />, {
      wrapper: createWrapper(),
    });

    const flowButtons = screen.getAllByRole("button", { name: "Flow" });
    await user.click(flowButtons[0]!);

    expect(setView).toHaveBeenCalledWith("flow");
  });

  it("project menu lists projects and selects Second Project", async () => {
    const user = userEvent.setup();
    const setCurrentProject = vi.fn();
    const secondProject: Project = {
      ...mockProjects[0]!,
      id: "proj-2",
      name: "Second Project",
    };

    render(
      <WorkspaceChrome
        {...defaultProps}
        projects={[...mockProjects, secondProject]}
        setCurrentProject={setCurrentProject}
      />,
      { wrapper: createWrapper() }
    );

    const projectMenus = screen.getAllByRole("button", {
      name: "Project menu",
    });
    await user.click(projectMenus[0]!);

    const secondProjectItem = screen.getByRole("menuitemradio", {
      name: /Second Project/,
    });
    await user.click(secondProjectItem);

    expect(setCurrentProject).toHaveBeenCalledOnce();
    expect(setCurrentProject).toHaveBeenCalledWith(secondProject);
  });

  it("project menu contains project actions", async () => {
    const user = userEvent.setup();

    render(<WorkspaceChrome {...defaultProps} />, { wrapper: createWrapper() });

    const projectMenus = screen.getAllByRole("button", {
      name: "Project menu",
    });
    await user.click(projectMenus[0]!);

    expect(
      screen.getByRole("menuitem", { name: "Project settings" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Import from GitLab" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Import ZIP" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Manage projects" })
    ).toBeInTheDocument();
  });

  it("account menu contains appearance, palettes, shortcuts, settings, and logout", async () => {
    const user = userEvent.setup();

    render(<WorkspaceChrome {...defaultProps} />, { wrapper: createWrapper() });

    const accountMenus = screen.getAllByRole("button", {
      name: "Account menu",
    });
    await user.click(accountMenus[0]!);

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Appearance: Dark" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitemradio", { name: "Periwinkle" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitemradio", { name: "Forest" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitemradio", { name: "Dark Amethyst" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitemradio", { name: "Graphite" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Keyboard shortcuts" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Settings" })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Logout" })
    ).toBeInTheDocument();
  });

  it("logout item calls onLogout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();

    render(<WorkspaceChrome {...defaultProps} onLogout={onLogout} />, {
      wrapper: createWrapper(),
    });

    const accountMenus = screen.getAllByRole("button", {
      name: "Account menu",
    });
    await user.click(accountMenus[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Logout" }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("settings item opens settings", async () => {
    const user = userEvent.setup();
    const onSettingsOpenChangeExternally = vi.fn();

    render(
      <WorkspaceChrome
        {...defaultProps}
        isSettingsOpenExternally={false}
        onSettingsOpenChangeExternally={onSettingsOpenChangeExternally}
      />,
      { wrapper: createWrapper() }
    );

    const accountMenus = screen.getAllByRole("button", {
      name: "Account menu",
    });
    await user.click(accountMenus[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(onSettingsOpenChangeExternally).toHaveBeenCalledWith(true);
  });

  it("hidden does not render the top bar nav", () => {
    render(<WorkspaceChrome {...defaultProps} hidden />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.queryByRole("button", { name: "Project menu" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Account menu" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspace views" })
    ).not.toBeInTheDocument();
  });
});
