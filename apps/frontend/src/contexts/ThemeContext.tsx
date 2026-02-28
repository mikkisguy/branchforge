import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type ThemePalette = "forest" | "periwinkle" | "dark-amethyst" | "graphite";

interface ThemeColors {
  primary: string;
  hover: string;
}

const themeConfigs: Record<ThemePalette, ThemeColors> = {
  "forest": { primary: "#40bb82", hover: "#52c992" },
  "periwinkle": { primary: "#3d4ac2", hover: "#515fcc" },
  "dark-amethyst": { primary: "#9549b6", hover: "#a960c7" },
  "graphite": { primary: "#888888", hover: "#9a9a9a" },
};

interface ThemeContextType {
  theme: ThemePalette;
  setTheme: (theme: ThemePalette) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePalette>(() => {
    const saved = localStorage.getItem("branchforge-theme") as ThemePalette;
    return saved || "forest";
  });

  const colors = themeConfigs[theme];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--theme-color", colors.primary);
    root.style.setProperty("--theme-color-hover", colors.hover);

    // Generate rgba variants for opacity support
    const rgb = hexToRgb(colors.primary);
    if (rgb) {
      root.style.setProperty("--theme-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      // Theme border color (subtle version of theme color)
      root.style.setProperty("--theme-border", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
      root.style.setProperty("--theme-border-subtle", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
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
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
