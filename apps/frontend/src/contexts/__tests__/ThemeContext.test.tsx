/**
 * ThemeContext Tests
 *
 * Tests for the ThemeContext which manages theme state and CSS custom properties.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../ThemeContext";
import type { ThemePalette } from "../ThemeContext";

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

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    // Clear CSS custom properties
    document.documentElement.style.removeProperty("--theme-color");
    document.documentElement.style.removeProperty("--theme-color-hover");
    document.documentElement.style.removeProperty("--theme-color-rgb");
    document.documentElement.style.removeProperty("--theme-border");
    document.documentElement.style.removeProperty("--theme-border-subtle");
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Helper component to test the hook
  function TestComponent() {
    const { theme, setTheme, colors } = useTheme();
    return (
      <div data-theme={theme} data-primary={colors.primary}>
        <button onClick={() => setTheme("forest")}>Set Forest</button>
      </div>
    );
  }

  describe("Default Theme", () => {
    it("should use periwinkle as default theme when no saved theme", () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const container = document.querySelector('[data-theme="periwinkle"]');
      expect(container).toBeInTheDocument();
    });

    it("should set correct CSS custom properties for periwinkle", () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      expect(document.documentElement.style.getPropertyValue("--theme-color")).toBe("#3d4ac2");
      expect(document.documentElement.style.getPropertyValue("--theme-color-hover")).toBe("#515fcc");
    });

    it("should calculate RGB variants correctly for periwinkle", () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const rgb = document.documentElement.style.getPropertyValue("--theme-color-rgb");
      expect(rgb).toBe("61, 74, 194"); // #3d4ac2 = rgb(61, 74, 194)

      const border = document.documentElement.style.getPropertyValue("--theme-border");
      expect(border).toBe("rgba(61, 74, 194, 0.3)");

      const borderSubtle = document.documentElement.style.getPropertyValue("--theme-border-subtle");
      expect(borderSubtle).toBe("rgba(61, 74, 194, 0.15)");
    });
  });

  describe("Saved Theme", () => {
    it("should load saved theme from localStorage", () => {
      localStorage.setItem("branchforge-theme", "forest");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const container = document.querySelector('[data-theme="forest"]');
      expect(container).toBeInTheDocument();
    });

    it("should set correct colors for forest theme", () => {
      localStorage.setItem("branchforge-theme", "forest");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const container = document.querySelector('[data-primary="#40bb82"]');
      expect(container).toBeInTheDocument();

      expect(document.documentElement.style.getPropertyValue("--theme-color")).toBe("#40bb82");
    });

    it("should fall back to default for invalid saved theme", () => {
      localStorage.setItem("branchforge-theme", "invalid-theme");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const container = document.querySelector('[data-theme="periwinkle"]');
      expect(container).toBeInTheDocument();
    });
  });

  describe("Set Theme", () => {
    it("should update theme when setTheme is called", async () => {
      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const button = container.querySelector("button");
      if (button) {
        button.click();
      }

      await waitFor(() => {
        const updatedContainer = document.querySelector('[data-theme="forest"]');
        expect(updatedContainer).toBeInTheDocument();
      });
    });

    it("should save theme to localStorage when changed", async () => {
      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const button = container.querySelector("button");
      if (button) {
        button.click();
      }

      await waitFor(() => {
        expect(localStorage.getItem("branchforge-theme")).toBe("forest");
      });
    });

    it("should update CSS custom properties when theme changes", async () => {
      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const button = container.querySelector("button");
      if (button) {
        button.click();
      }

      await waitFor(() => {
        expect(document.documentElement.style.getPropertyValue("--theme-color")).toBe("#40bb82");
        expect(document.documentElement.style.getPropertyValue("--theme-color-hover")).toBe("#52c992");
      });
    });

    it("should update RGB variants when theme changes", async () => {
      const { container } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const button = container.querySelector("button");
      if (button) {
        button.click();
      }

      await waitFor(() => {
        const rgb = document.documentElement.style.getPropertyValue("--theme-color-rgb");
        expect(rgb).toBe("64, 187, 130"); // #40bb82 = rgb(64, 187, 130)
      });
    });
  });

  describe("Theme Colors", () => {
    it("should provide correct colors for all themes", () => {
      const themes: ThemePalette[] = ["forest", "periwinkle", "dark-amethyst", "graphite"];
      const expectedColors: Record<ThemePalette, { primary: string; hover: string }> = {
        forest: { primary: "#40bb82", hover: "#52c992" },
        periwinkle: { primary: "#3d4ac2", hover: "#515fcc" },
        "dark-amethyst": { primary: "#9549b6", hover: "#a960c7" },
        graphite: { primary: "#9ca3af", hover: "#b0b7c4" },
      };

      for (const theme of themes) {
        localStorage.clear();
        localStorage.setItem("branchforge-theme", theme);

        const { container } = render(
          <ThemeProvider>
            <TestComponent />
          </ThemeProvider>
        );

        const primaryEl = container.querySelector(`[data-primary="${expectedColors[theme].primary}"]`);
        expect(primaryEl).toBeInTheDocument();
      }
    });
  });

  describe("Theme Provider", () => {
    it("should provide theme context to children", () => {
      expect(() => {
        render(
          <ThemeProvider>
            <TestComponent />
          </ThemeProvider>
        );
      }).not.toThrow();
    });
  });

  describe("useTheme Hook", () => {
    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow("useTheme must be used within ThemeProvider");

      consoleError.mockRestore();
    });
  });
});
