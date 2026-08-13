/**
 * LeftSidebar Tests
 *
 * Verifies sidebar buttons have proper ARIA labels for accessibility.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/contexts/ToastContext";
import { LeftSidebar } from "../LeftSidebar";
import type { Project } from "@/lib/api/projects";
import type { ThemePalette } from "@branchforge/shared";
import type { ReactNode } from "react";

const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "Test Project",
    source: "ZIP",
    duoEndingEnabled: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

const themePalettes = [
  { name: "Periwinkle", key: "periwinkle" as ThemePalette, color: "#5b6ae0" },
  { name: "Forest", key: "forest" as ThemePalette, color: "#26714e" },
];

const defaultProps = {
  mode: "write" as const,
  setMode: vi.fn(),
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
  isCollapsed: true,
  onCollapsedChange: vi.fn(),
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

describe("LeftSidebar accessibility", () => {
  // The LeftSidebar renders both a desktop sidebar and a mobile bottom
  // navigation simultaneously. Since jsdom doesn't respect media queries,
  // buttons that appear in both navs (e.g. "Write Mode") are duplicated.
  // We use getAllByRole with length checks for those.

  it("renders mode switcher buttons with aria-labels", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    const writeButtons = screen.getAllByRole("button", { name: "Write Mode" });
    expect(writeButtons.length).toBeGreaterThanOrEqual(1);
    writeButtons.forEach((btn) =>
      expect(btn).toHaveAttribute("aria-label", "Write Mode")
    );

    const scriptButtons = screen.getAllByRole("button", {
      name: "Script Mode",
    });
    expect(scriptButtons.length).toBeGreaterThanOrEqual(1);
    scriptButtons.forEach((btn) =>
      expect(btn).toHaveAttribute("aria-label", "Script Mode")
    );
  });

  it("renders project selector button with aria-label when collapsed", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    const projectButtons = screen.getAllByRole("button", {
      name: "Select Project",
    });
    expect(projectButtons.length).toBeGreaterThanOrEqual(1);
    projectButtons.forEach((btn) =>
      expect(btn).toHaveAttribute("aria-label", "Select Project")
    );
  });

  it("renders nav buttons with aria-labels", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    const settingsButtons = screen.getAllByRole("button", {
      name: "Project settings",
    });
    expect(settingsButtons.length).toBeGreaterThanOrEqual(1);
    settingsButtons.forEach((btn) =>
      expect(btn).toHaveAttribute("aria-label", "Project settings")
    );

    const flowButtons = screen.getAllByRole("button", { name: "Flow Graph" });
    expect(flowButtons.length).toBeGreaterThanOrEqual(1);
    flowButtons.forEach((btn) =>
      expect(btn).toHaveAttribute("aria-label", "Flow Graph")
    );
  });

  it("renders collapse button with aria-label", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    expect(
      screen.getByRole("button", { name: "Expand sidebar" })
    ).toBeInTheDocument();
  });

  it("renders collapse button with 'Collapse sidebar' when expanded", () => {
    render(<LeftSidebar {...defaultProps} isCollapsed={false} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByRole("button", { name: "Collapse sidebar" })
    ).toBeInTheDocument();
  });

  it("renders dark mode toggle with aria-label", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    expect(
      screen.getByRole("button", { name: "Switch to light mode" })
    ).toBeInTheDocument();
  });

  it("renders theme switcher button with aria-label", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();
  });

  it("renders user action buttons with aria-labels", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    const keyboardShortcutsButtons = screen.getAllByRole("button", {
      name: "Keyboard shortcuts",
    });
    expect(keyboardShortcutsButtons.length).toBeGreaterThanOrEqual(1);
    keyboardShortcutsButtons.forEach((btn) =>
      expect(btn).toHaveAttribute("aria-label", "Keyboard shortcuts")
    );

    expect(
      screen.getByRole("button", { name: "Settings" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("opens the keyboard shortcuts dialog from the help trigger", async () => {
    const user = userEvent.setup();
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const helpTriggers = screen.getAllByRole("button", {
      name: "Keyboard shortcuts",
    });
    await user.click(helpTriggers[0]!);

    expect(
      screen.getByRole("heading", { name: "Keyboard shortcuts" })
    ).toBeInTheDocument();
  });

  it("renders mobile bottom nav hamburger with dynamic aria-label (closed state)", () => {
    render(<LeftSidebar {...defaultProps} />, { wrapper: createWrapper() });

    // Only the mobile bottom nav has this button (desktop sidebar does not)
    expect(
      screen.getByRole("button", { name: "Open menu" })
    ).toBeInTheDocument();
  });

  it("renders theme palette swatches with aria-labels when theme popover is open", () => {
    // Passing isCollapsed=false so theme renders inline (not in a popover)
    render(<LeftSidebar {...defaultProps} isCollapsed={false} />, {
      wrapper: createWrapper(),
    });

    // Palette swatches render inline when expanded
    expect(
      screen.getByRole("button", { name: "Periwinkle" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forest" })).toBeInTheDocument();
  });
});
