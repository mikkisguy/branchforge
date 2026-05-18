import { createContext, use } from "react";

export type ThemePalette =
  | "forest"
  | "periwinkle"
  | "dark-amethyst"
  | "graphite";

interface ThemeColors {
  primary: string;
  hover: string;
}

interface ThemeContextType {
  theme: ThemePalette;
  setTheme: (theme: ThemePalette) => void;
  colors: ThemeColors;
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
