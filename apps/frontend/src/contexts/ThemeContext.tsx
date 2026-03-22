import { useEffect, useState, type ReactNode } from "react";
import {
  ThemeContext,
  type ThemePalette,
  type ThemeColors,
} from "./useTheme";

const themeConfigs: Record<ThemePalette, ThemeColors> = {
  forest: { primary: "#40bb82", hover: "#52c992" },
  periwinkle: { primary: "#3d4ac2", hover: "#515fcc" },
  "dark-amethyst": { primary: "#9549b6", hover: "#a960c7" },
  graphite: { primary: "#9ca3af", hover: "#b0b7c4" },
};

// Type guard to validate if a string is a valid ThemePalette
function isValidTheme(value: string): value is ThemePalette {
  return ["forest", "periwinkle", "dark-amethyst", "graphite"].includes(value);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePalette>(() => {
    const saved = localStorage.getItem("branchforge-theme");
    return saved && isValidTheme(saved) ? saved : "periwinkle";
  });

  const colors = themeConfigs[theme];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--theme-color", colors.primary);
    root.style.setProperty("--theme-color-hover", colors.hover);

    // Generate rgba variants for opacity support
    const rgb = hexToRgb(colors.primary);
    if (rgb) {
      root.style.setProperty(
        "--theme-color-rgb",
        `${rgb.r}, ${rgb.g}, ${rgb.b}`
      );
      // Theme border color (subtle version of theme color)
      root.style.setProperty(
        "--theme-border",
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`
      );
      root.style.setProperty(
        "--theme-border-subtle",
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`
      );
    }

    // Syntax highlighting color - brighter variant for better contrast
    const syntaxRgb = hexToRgb(colors.hover);
    if (syntaxRgb) {
      root.style.setProperty(
        "--syntax-color",
        `rgb(${syntaxRgb.r}, ${syntaxRgb.g}, ${syntaxRgb.b})`
      );
    }
  }, [theme, colors]);

  const setTheme = (newTheme: ThemePalette) => {
    setThemeState(newTheme);
    localStorage.setItem("branchforge-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Ensure input is a string and has valid hex format
  if (typeof hex !== "string") {
    return null;
  }

  // Remove hash if present and validate format
  const hexValue = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hexValue)) {
    return null;
  }

  // Parse the hex values
  const r = parseInt(hexValue.substring(0, 2), 16);
  const g = parseInt(hexValue.substring(2, 4), 16);
  const b = parseInt(hexValue.substring(4, 6), 16);

  // Validate parsed values are valid numbers (0-255)
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  return { r, g, b };
}

// Re-export type for convenience
export type { ThemePalette } from "./useTheme";
