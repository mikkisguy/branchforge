import { createContext, use } from "react";
import type { ThemePalette } from "@branchforge/shared";

export type { ThemePalette };

interface ThemeColors {
  primary: string;
  hover: string;
}

interface ThemeContextType {
  theme: ThemePalette;
  setTheme: (theme: ThemePalette) => void;
  colors: ThemeColors;
  /** Whether dark mode is active. Independent of the color palette. */
  isDarkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);

export function useTheme(): ThemeContextType {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export type { ThemeColors, ThemeContextType };
