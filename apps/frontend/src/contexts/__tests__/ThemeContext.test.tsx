/**
 * ThemeContext Tests
 *
 * Tests for the ThemeContext which manages theme state and CSS custom properties.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../ThemeContext";
import { themeConfigs } from "../themeConfigs";
import { useTheme, type ThemePalette } from "../useTheme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/contexts/ToastContext";
import type { ReactNode } from "react";

// Mock the API module
vi.mock("@/lib/api/user-settings", () => ({
  userSettingsApi: {
    getSettings: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue({}),
    uploadAvatar: vi.fn(),
    deleteAvatar: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
});

// Create test wrapper that provides QueryClientProvider + ToastProvider
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

describe("ThemeContext", () => {
  const removeCSSProperties = () => {
    document.documentElement.style.removeProperty("--theme-color");
    document.documentElement.style.removeProperty("--theme-color-hover");
    document.documentElement.style.removeProperty("--theme-color-rgb");
    document.documentElement.style.removeProperty("--theme-border");
    document.documentElement.style.removeProperty("--theme-border-subtle");
    document.documentElement.style.removeProperty("--theme-foreground");
    document.documentElement.style.removeProperty("--surface-tint");
    document.documentElement.style.removeProperty("--surface-tint-strong");
  };

  const removeModeClasses = () => {
    document.documentElement.classList.remove("dark", "light");
  };

  beforeEach(() => {
    localStorage.clear();
    // Clear CSS custom properties
    removeCSSProperties();
    removeModeClasses();
  });

  afterEach(() => {
    localStorage.clear();
    // Clear CSS custom properties
    removeCSSProperties();
    removeModeClasses();
  });

  // Helper component to test the hook
  function TestComponent() {
    const { theme, setTheme, colors } = useTheme();
    return (
      <div
        data-theme={theme}
        data-primary={colors.primary}
        data-hover={colors.hover}
      >
        <button onClick={() => setTheme("forest")}>Set Forest</button>
      </div>
    );
  }

  describe("Default Theme", () => {
    it("should use periwinkle as default theme when no saved theme", () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const container = document.querySelector('[data-theme="periwinkle"]');
      expect(container).toBeInTheDocument();
    });

    it("should set correct CSS custom properties for periwinkle", () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      expect(
        document.documentElement.style.getPropertyValue("--theme-color")
      ).toBe("#5b6ae0");
      expect(
        document.documentElement.style.getPropertyValue("--theme-color-hover")
      ).toBe("#727ae8");
    });

    it("should calculate RGB variants correctly for periwinkle", () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const rgb =
        document.documentElement.style.getPropertyValue("--theme-color-rgb");
      expect(rgb).toBe("91, 106, 224"); // #5b6ae0 = rgb(91, 106, 224)

      const border =
        document.documentElement.style.getPropertyValue("--theme-border");
      expect(border).toBe("rgba(91, 106, 224, 0.3)");

      const borderSubtle = document.documentElement.style.getPropertyValue(
        "--theme-border-subtle"
      );
      expect(borderSubtle).toBe("rgba(91, 106, 224, 0.15)");
    });
  });

  describe("Saved Theme", () => {
    it("should load saved theme from localStorage", () => {
      localStorage.setItem("branchforge:theme", "forest");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const container = document.querySelector('[data-theme="forest"]');
      expect(container).toBeInTheDocument();
    });

    it("should set correct colors for forest theme", () => {
      localStorage.setItem("branchforge:theme", "forest");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const container = document.querySelector('[data-primary="#26714e"]');
      expect(container).toBeInTheDocument();

      expect(
        document.documentElement.style.getPropertyValue("--theme-color")
      ).toBe("#26714e");
    });

    it("should fall back to default for invalid saved theme", () => {
      localStorage.setItem("branchforge:theme", "invalid-theme");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const container = document.querySelector('[data-theme="periwinkle"]');
      expect(container).toBeInTheDocument();
    });
  });

  describe("Set Theme", () => {
    it("should update theme when setTheme is called", async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Forest" }));

      await waitFor(() => {
        const updatedContainer = document.querySelector(
          '[data-theme="forest"]'
        );
        expect(updatedContainer).toBeInTheDocument();
      });
    });

    it("should save theme to localStorage when changed", async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Forest" }));

      await waitFor(() => {
        expect(localStorage.getItem("branchforge:theme")).toBe("forest");
      });
    });

    it("should update CSS custom properties when theme changes", async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Forest" }));

      await waitFor(() => {
        expect(
          document.documentElement.style.getPropertyValue("--theme-color")
        ).toBe("#26714e");
        expect(
          document.documentElement.style.getPropertyValue("--theme-color-hover")
        ).toBe("#339668");
      });
    });

    it("should update RGB variants when theme changes", async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Forest" }));

      await waitFor(() => {
        const rgb =
          document.documentElement.style.getPropertyValue("--theme-color-rgb");
        expect(rgb).toBe("38, 113, 78"); // #26714e = rgb(38, 113, 78)
      });
    });
  });

  describe("Theme Colors", () => {
    const themes: ThemePalette[] = [
      "forest",
      "periwinkle",
      "dark-amethyst",
      "graphite",
    ];

    it.each(themes)("should provide correct colors for %s", (theme) => {
      localStorage.setItem("branchforge:theme", theme);

      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const primaryEl = container.querySelector(
        `[data-primary="${themeConfigs[theme].primary}"]`
      );
      expect(primaryEl).toBeInTheDocument();

      const hoverEl = container.querySelector(
        `[data-hover="${themeConfigs[theme].hover}"]`
      );
      expect(hoverEl).toBeInTheDocument();
    });

    // Regression test: verify all themes have the correct expected colors.
    // This catches accidental changes to themeConfigs that the parameterized test above
    // would miss (since it uses themeConfigs as both source and expected value).
    const expectedColors: Record<
      ThemePalette,
      { primary: string; hover: string }
    > = {
      forest: { primary: "#26714e", hover: "#339668" },
      periwinkle: { primary: "#5b6ae0", hover: "#727ae8" },
      "dark-amethyst": { primary: "#9549b6", hover: "#a960c7" },
      graphite: { primary: "#686a71", hover: "#b0b7c4" },
    };

    it.each(themes)("should have correct hardcoded colors for %s", (theme) => {
      localStorage.setItem("branchforge:theme", theme);

      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      // These values should match the documented theme colors
      expect(
        container.querySelector(
          `[data-primary="${expectedColors[theme].primary}"]`
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(`[data-hover="${expectedColors[theme].hover}"]`)
      ).toBeInTheDocument();
    });
  });

  describe("Theme Provider", () => {
    it("should provide theme context to children", () => {
      expect(() => {
        render(
          <ThemeProvider>
            <TestComponent />
          </ThemeProvider>,
          { wrapper: createWrapper() }
        );
      }).not.toThrow();
    });
  });

  describe("useTheme Hook", () => {
    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow("useTheme must be used within ThemeProvider");

      consoleError.mockRestore();
    });
  });

  describe("Dark/Light Mode", () => {
    function DarkModeTestComponent() {
      const { isDarkMode, toggleDarkMode, setDarkMode } = useTheme();
      return (
        <div data-testid="mode" data-dark={String(isDarkMode)}>
          <button onClick={toggleDarkMode}>Toggle</button>
          <button onClick={() => setDarkMode(false)}>Set Light</button>
        </div>
      );
    }

    it("should default to dark mode", () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("mode")).toHaveAttribute("data-dark", "true");
    });

    it("should apply .dark class to <html> and not .light by default", () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.classList.contains("light")).toBe(false);
    });

    it("should apply .light class and remove .dark when switching to light", async () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Light" }));

      await waitFor(() => {
        expect(screen.getByTestId("mode")).toHaveAttribute(
          "data-dark",
          "false"
        );
      });

      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("should toggle between dark and light", async () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("mode")).toHaveAttribute("data-dark", "true");

      fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
      await waitFor(() => {
        expect(screen.getByTestId("mode")).toHaveAttribute(
          "data-dark",
          "false"
        );
      });

      fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
      await waitFor(() => {
        expect(screen.getByTestId("mode")).toHaveAttribute("data-dark", "true");
      });
    });

    it("should persist dark/light preference to localStorage", async () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Light" }));

      await waitFor(() => {
        expect(localStorage.getItem("branchforge:dark-mode")).toBe("false");
      });
    });

    it("should load saved light preference from localStorage", () => {
      localStorage.setItem("branchforge:dark-mode", "false");

      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("mode")).toHaveAttribute("data-dark", "false");
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("should keep dark/light mode independent of the color palette", async () => {
      localStorage.setItem("branchforge:theme", "forest");
      localStorage.setItem("branchforge:dark-mode", "false");

      function CombinedComponent() {
        const { theme, isDarkMode } = useTheme();
        return <div data-theme={theme} data-dark={String(isDarkMode)} />;
      }

      render(
        <ThemeProvider>
          <CombinedComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      const el = document.querySelector("[data-theme='forest']");
      expect(el).toBeInTheDocument();
      expect(el).toHaveAttribute("data-dark", "false");
    });

    it("should set transparent surface tints in dark mode", () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      expect(
        document.documentElement.style.getPropertyValue("--surface-tint")
      ).toBe("transparent");
      expect(
        document.documentElement.style.getPropertyValue("--surface-tint-strong")
      ).toBe("transparent");
    });

    it("should set palette-tinted surface vars in light mode", async () => {
      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      fireEvent.click(screen.getByRole("button", { name: "Set Light" }));

      await waitFor(() => {
        const tint =
          document.documentElement.style.getPropertyValue("--surface-tint");
        // Should be an rgba value using the periwinkle theme color (not transparent)
        expect(tint).toContain("rgba(");
        expect(tint).not.toBe("transparent");
      });

      const tintStrong = document.documentElement.style.getPropertyValue(
        "--surface-tint-strong"
      );
      expect(tintStrong).toContain("rgba(");
      expect(tintStrong).not.toBe("transparent");
    });

    it("should clear surface tints when switching back to dark mode", async () => {
      localStorage.setItem("branchforge:dark-mode", "false");

      render(
        <ThemeProvider>
          <DarkModeTestComponent />
        </ThemeProvider>,
        { wrapper: createWrapper() }
      );

      // Starts in light mode — tint is set
      await waitFor(() => {
        expect(
          document.documentElement.style.getPropertyValue("--surface-tint")
        ).not.toBe("transparent");
      });

      // Switch to dark
      fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

      await waitFor(() => {
        expect(
          document.documentElement.style.getPropertyValue("--surface-tint")
        ).toBe("transparent");
      });
    });
  });
});
