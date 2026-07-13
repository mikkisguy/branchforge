import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { ThemeContext, type ThemePalette, type ThemeColors } from "./useTheme";
import {
  useLocalStorage,
  useLocalStorageBoolean,
} from "@/hooks/useLocalStorage";
import { useUserSettings } from "@/hooks/useUserSettings";
import { isValidTheme } from "@branchforge/shared";

export const themeConfigs: Record<ThemePalette, ThemeColors> = {
  // Forest green darkened from #40bb82 to #26714e for ≥4.5:1 white-on-green
  // button contrast while still reading as Forest green on dark UIs.
  forest: { primary: "#26714e", hover: "#339668", foreground: "#ffffff" },
  // Periwinkle brightened from #3d4ac2 to #5b6ae0 for ≥3:1 text contrast
  // on dark backgrounds while keeping white foreground on buttons ≥4.5:1.
  periwinkle: {
    primary: "#5b6ae0",
    hover: "#727ae8",
    foreground: "#ffffff",
  },
  "dark-amethyst": {
    primary: "#9549b6",
    hover: "#a960c7",
    foreground: "#ffffff",
  },
  graphite: {
    primary: "#72757d",
    hover: "#b0b7c4",
    foreground: "#ffffff",
  },
};

// Status colors (theme-independent for semantic consistency)
const STATUS_COLORS = {
  review: "#f59e0b", // amber for review needed
  draft: "#64748b", // slate for draft/pending
  final: "#10b981", // emerald for final/complete
} as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [localTheme, setLocalThemeState] = useLocalStorage<ThemePalette>(
    "theme",
    "periwinkle",
    {
      serializer: (value) => value,
      deserializer: (value) => value as ThemePalette,
      validate: isValidTheme,
    }
  );

  // Dark/light mode preference. Defaults to dark (true) for existing users so
  // current behavior is unchanged. Stored separately from the color palette.
  const [isDarkMode, setIsDarkMode] = useLocalStorageBoolean("dark-mode", true);

  const { settings, updateProfile } = useUserSettings();

  // Use theme from database settings if available, otherwise fall back to localStorage
  const theme =
    (settings?.theme && isValidTheme(settings.theme)
      ? settings.theme
      : localTheme) ?? "periwinkle";

  const colors = themeConfigs[theme];

  // Sync theme to localStorage when it changes (for immediate feedback)
  useEffect(() => {
    setLocalThemeState(theme);
  }, [theme, setLocalThemeState]);

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
      // Theme foreground color (computed per-palette for ≥4.5:1 contrast)
      root.style.setProperty("--theme-foreground", colors.foreground);
    }

    // Status colors for scene navigation
    root.style.setProperty("--theme-review-color", STATUS_COLORS.review);
    root.style.setProperty("--theme-draft-color", STATUS_COLORS.draft);
    root.style.setProperty("--theme-final-color", STATUS_COLORS.final);
  }, [theme, colors]);

  // Apply dark/light mode. `.dark` activates Tailwind `dark:` utilities and the
  // `:root` dark CSS variables; `.light` swaps in the light CSS variables.
  // Exactly one class is present at a time. useLayoutEffect avoids a one-frame
  // dark flash for returning light-mode users before `.light` is applied.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDarkMode);
    root.classList.toggle("light", !isDarkMode);
  }, [isDarkMode]);

  // Palette-tinted surfaces for light mode. In light mode we layer a subtle
  // theme-color wash over card backgrounds so the chrome feels branded (matching
  // dark mode's tinted atmosphere) instead of flat white. In dark mode these
  // are transparent so behavior is unchanged.
  useEffect(() => {
    const root = document.documentElement;
    const rgb = hexToRgb(colors.primary);
    if (!isDarkMode && rgb) {
      root.style.setProperty(
        "--surface-tint",
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`
      );
      root.style.setProperty(
        "--surface-tint-strong",
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`
      );
    } else {
      root.style.setProperty("--surface-tint", "transparent");
      root.style.setProperty("--surface-tint-strong", "transparent");
    }
  }, [theme, colors, isDarkMode]);

  const setDarkMode = useCallback(
    (dark: boolean) => setIsDarkMode(dark),
    [setIsDarkMode]
  );
  const toggleDarkMode = useCallback(
    () => setIsDarkMode((prev) => !prev),
    [setIsDarkMode]
  );

  const contextValue = useMemo(
    () => ({
      theme,
      setTheme: (newTheme: ThemePalette) => {
        setLocalThemeState(newTheme);
        updateProfile({ theme: newTheme }, { silent: true }).catch(() => {});
      },
      colors,
      isDarkMode,
      setDarkMode,
      toggleDarkMode,
    }),
    [
      theme,
      setLocalThemeState,
      updateProfile,
      colors,
      isDarkMode,
      setDarkMode,
      toggleDarkMode,
    ]
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
