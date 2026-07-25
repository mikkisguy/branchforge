import type { ThemePalette } from "@branchforge/shared";
import type { ThemeColors } from "./useTheme";

export const themeConfigs: Record<ThemePalette, ThemeColors> = {
  // Forest green darkened from #40bb82 to #26714e for ≥4.5:1 white-on-green
  // button contrast while still reading as Forest green on dark UIs.
  // Hover foregrounds are dark (#0a0a0a) so labels meet ≥4.5:1 on every
  // hover swatch — the button lightens on hover and the text flips to dark.
  forest: {
    primary: "#26714e",
    hover: "#339668",
    foreground: "#ffffff",
    hoverForeground: "#0a0a0a",
  },
  periwinkle: {
    primary: "#5b6ae0",
    hover: "#727ae8",
    foreground: "#ffffff",
    hoverForeground: "#0a0a0a",
  },
  "dark-amethyst": {
    primary: "#9549b6",
    hover: "#a960c7",
    foreground: "#ffffff",
    hoverForeground: "#0a0a0a",
  },
  graphite: {
    primary: "#686a71",
    hover: "#b0b7c4",
    foreground: "#ffffff",
    hoverForeground: "#0a0a0a",
  },
};
