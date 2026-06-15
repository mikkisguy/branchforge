import { useEffect, useMemo, type ReactNode } from "react";
import { ThemeContext, type ThemePalette, type ThemeColors } from "./useTheme";
import { useLocalStorage } from "@/hooks/useLocalStorage";

export const themeConfigs: Record<ThemePalette, ThemeColors> = {
  forest: { primary: "#40bb82", hover: "#52c992" },
  periwinkle: { primary: "#3d4ac2", hover: "#515fcc" },
  "dark-amethyst": { primary: "#9549b6", hover: "#a960c7" },
  graphite: { primary: "#72757d", hover: "#b0b7c4" },
};

// Status colors (theme-independent for semantic consistency)
const STATUS_COLORS = {
  review: "#f59e0b", // amber for review needed
  draft: "#64748b", // slate for draft/pending
  final: "#10b981", // emerald for final/complete
} as const;

// Type guard to validate if a string is a valid ThemePalette
function isValidTheme(value: string): value is ThemePalette {
  return ["forest", "periwinkle", "dark-amethyst", "graphite"].includes(value);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useLocalStorage<ThemePalette>(
    "theme",
    "periwinkle",
    {
      serializer: (value) => value,
      deserializer: (value) => value as ThemePalette,
      validate: isValidTheme,
    }
  );

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
      // Theme foreground color for buttons (always white for best contrast with theme colors)
      root.style.setProperty("--theme-foreground", "#ffffff");
    }

    // Status colors for scene navigation
    root.style.setProperty("--theme-review-color", STATUS_COLORS.review);
    root.style.setProperty("--theme-draft-color", STATUS_COLORS.draft);
    root.style.setProperty("--theme-final-color", STATUS_COLORS.final);
  }, [theme, colors]);

  const contextValue = useMemo(
    () => ({ theme, setTheme: setThemeState, colors }),
    [theme, setThemeState, colors]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
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
