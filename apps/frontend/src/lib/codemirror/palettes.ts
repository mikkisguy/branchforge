/**
 * Color palettes for Ren'Py syntax highlighting
 * Each palette maps to the CSS custom properties used in renpy-theme.ts
 * All colors use HSL format for consistency with the site CSS
 */

export type PaletteGroup = "App Themes" | "Others";

export interface SyntaxPalette {
  name: string;
  group: PaletteGroup;
  indicator: string; // Color for dropdown icon
  colors: {
    keyword: string;
    string: string;
    comment: string;
    number: string;
    variable: string;
    atom: string;
    property: string;
    operator: string;
    punctuation: string;
    configKeyword: string;
    audioKeyword: string;
  };
}

export const PALETTES: SyntaxPalette[] = [
  // Theme-based palettes - colors derived from theme primary
  {
    name: "Mixed",
    group: "App Themes",
    indicator: "hsl(0, 0%, 100%)", // white (neutral indicator)
    colors: {
      keyword: "hsl(150, 53%, 49%)", // Forest green
      string: "hsl(0, 0%, 82%)", // off-white
      comment: "hsl(0, 0%, 50%)", // neutral gray
      number: "hsl(280, 43%, 75%)", // Amethyst pale purple
      variable: "hsl(225, 85%, 66%)", // Periwinkle bright blue
      atom: "hsl(210, 17%, 78%)", // Graphite light gray
      property: "hsl(280, 53%, 60%)", // Amethyst bright purple
      operator: "hsl(0, 0%, 69%)", // gray
      punctuation: "hsl(0, 0%, 50%)", // darker gray
      configKeyword: "hsl(150, 53%, 33%)", // Forest dark green
      audioKeyword: "hsl(215, 100%, 72%)", // Periwinkle bright blue
    },
  },
  {
    name: "Forest",
    group: "App Themes",
    indicator: "hsl(150, 53%, 49%)", // forest green
    colors: {
      keyword: "hsl(150, 53%, 49%)", // forest primary
      string: "hsl(0, 0%, 82%)", // off-white
      comment: "hsl(120, 7%, 47%)", // grayish green
      number: "hsl(140, 38%, 75%)", // pale green
      variable: "hsl(150, 73%, 63%)", // bright mint
      atom: "hsl(140, 60%, 92%)", // very pale green
      property: "hsl(150, 54%, 41%)", // dark green
      operator: "hsl(0, 0%, 69%)", // gray
      punctuation: "hsl(0, 0%, 50%)", // darker gray
      configKeyword: "hsl(150, 60%, 33%)", // darker green
      audioKeyword: "hsl(160, 82%, 69%)", // cyan-green
    },
  },
  {
    name: "Periwinkle",
    group: "App Themes",
    indicator: "hsl(231, 59%, 52%)", // periwinkle blue
    colors: {
      keyword: "hsl(231, 59%, 52%)", // periwinkle primary
      string: "hsl(0, 0%, 82%)", // off-white
      comment: "hsl(240, 13%, 50%)", // grayish blue
      number: "hsl(225, 45%, 75%)", // pale blue
      variable: "hsl(225, 85%, 66%)", // bright blue
      atom: "hsl(240, 33%, 95%)", // very pale blue
      property: "hsl(240, 54%, 41%)", // dark blue
      operator: "hsl(0, 0%, 69%)", // gray
      punctuation: "hsl(0, 0%, 50%)", // darker gray
      configKeyword: "hsl(240, 60%, 33%)", // darker blue
      audioKeyword: "hsl(215, 100%, 72%)", // bright blue
    },
  },
  {
    name: "Dark Amethyst",
    group: "App Themes",
    indicator: "hsl(279, 51%, 50%)", // amethyst purple
    colors: {
      keyword: "hsl(279, 51%, 50%)", // amethyst primary
      string: "hsl(0, 0%, 82%)", // off-white
      comment: "hsl(270, 14%, 50%)", // grayish purple
      number: "hsl(280, 43%, 75%)", // pale purple
      variable: "hsl(280, 53%, 60%)", // bright purple
      atom: "hsl(280, 40%, 95%)", // very pale purple
      property: "hsl(270, 54%, 41%)", // dark purple
      operator: "hsl(0, 0%, 69%)", // gray
      punctuation: "hsl(0, 0%, 50%)", // darker gray
      configKeyword: "hsl(270, 60%, 33%)", // darker purple
      audioKeyword: "hsl(280, 82%, 72%)", // bright purple
    },
  },
  {
    name: "Graphite",
    group: "App Themes",
    indicator: "hsl(210, 11%, 65%)", // graphite gray
    colors: {
      keyword: "hsl(210, 11%, 65%)", // graphite primary
      string: "hsl(0, 0%, 82%)", // off-white
      comment: "hsl(0, 0%, 50%)", // neutral gray
      number: "hsl(210, 11%, 75%)", // light gray
      variable: "hsl(210, 17%, 78%)", // lighter gray
      atom: "hsl(225, 17%, 93%)", // very pale gray
      property: "hsl(210, 13%, 50%)", // cool gray
      operator: "hsl(0, 0%, 69%)", // gray
      punctuation: "hsl(0, 0%, 50%)", // darker gray
      configKeyword: "hsl(210, 14%, 45%)", // dark gray
      audioKeyword: "hsl(220, 17%, 77%)", // cool light gray
    },
  },
  {
    name: "Bright Maroon",
    group: "Others",
    indicator: "hsl(12, 72%, 43%)", // maroon
    colors: {
      keyword: "hsl(12, 72%, 43%)", // Bright Maroon
      string: "hsl(38, 100%, 40%)", // Dark Tangerine
      comment: "hsl(30, 13%, 43%)", // desaturated warm gray
      number: "hsl(40, 71%, 58%)", // April Sun
      variable: "hsl(38, 67%, 88%)", // Pale Banana
      atom: "hsl(40, 42%, 70%)", // Antique Ivory
      property: "hsl(36, 53%, 59%)", // darkened April Sun
      operator: "hsl(60, 7%, 63%)", // warm gray
      punctuation: "hsl(60, 9%, 38%)", // darker warm gray
      configKeyword: "hsl(12, 75%, 33%)", // darker maroon
      audioKeyword: "hsl(40, 75%, 73%)", // lighter April Sun
    },
  },
  {
    name: "Earth",
    group: "Others",
    indicator: "hsl(9, 43%, 50%)", // earthy red-brown
    colors: {
      keyword: "hsl(9, 43%, 50%)", // Sensible red-brown
      string: "hsl(75, 38%, 55%)", // Bergamot green
      comment: "hsl(0, 0%, 53%)", // lighter gray
      number: "hsl(33, 71%, 69%)", // Broken Yellow
      variable: "hsl(195, 47%, 54%)", // Royal Turquoise
      atom: "hsl(15, 21%, 68%)", // warm Tundora
      property: "hsl(36, 23%, 65%)", // warm gray
      operator: "hsl(0, 0%, 69%)", // neutral gray
      punctuation: "hsl(0, 0%, 57%)", // lighter gray
      configKeyword: "hsl(9, 38%, 41%)", // darker muted red
      audioKeyword: "hsl(195, 68%, 65%)", // bright turquoise
    },
  },
  {
    name: "Slate",
    group: "Others",
    indicator: "hsl(200, 35%, 40%)", // slate blue
    colors: {
      keyword: "hsl(200, 35%, 40%)", // slate blue
      string: "hsl(170, 40%, 45%)", // deep teal
      comment: "hsl(210, 15%, 40%)", // cool gray-brown
      number: "hsl(185, 45%, 65%)", // muted aqua
      variable: "hsl(195, 40%, 75%)", // soft blue-gray
      atom: "hsl(215, 30%, 80%)", // pale cool gray
      property: "hsl(180, 35%, 55%)", // muted teal
      operator: "hsl(200, 12%, 60%)", // cool gray
      punctuation: "hsl(210, 10%, 35%)", // dark cool gray
      configKeyword: "hsl(205, 40%, 30%)", // dark slate
      audioKeyword: "hsl(175, 50%, 70%)", // soft turquoise
    },
  },
  {
    name: "Neon",
    group: "Others",
    indicator: "hsl(330, 90%, 60%)", // hot pink
    colors: {
      keyword: "hsl(330, 90%, 60%)", // hot pink
      string: "hsl(45, 100%, 65%)", // bright yellow
      comment: "hsl(0, 0%, 60%)", // medium gray
      number: "hsl(60, 100%, 65%)", // golden yellow
      variable: "hsl(280, 85%, 65%)", // bright purple
      atom: "hsl(180, 100%, 70%)", // cyan
      property: "hsl(120, 85%, 65%)", // bright green
      operator: "hsl(0, 0%, 85%)", // light gray
      punctuation: "hsl(0, 0%, 70%)", // medium light gray
      configKeyword: "hsl(300, 85%, 55%)", // magenta
      audioKeyword: "hsl(50, 100%, 70%)", // amber
    },
  },
  {
    name: "Pastel",
    group: "Others",
    indicator: "hsl(340, 40%, 75%)", // soft pink
    colors: {
      keyword: "hsl(340, 40%, 75%)", // soft pink
      string: "hsl(40, 35%, 80%)", // soft yellow
      comment: "hsl(0, 0%, 55%)", // medium gray
      number: "hsl(200, 30%, 75%)", // soft blue
      variable: "hsl(150, 35%, 70%)", // soft green
      atom: "hsl(280, 30%, 80%)", // soft lavender
      property: "hsl(30, 30%, 75%)", // soft peach
      operator: "hsl(0, 0%, 75%)", // light gray
      punctuation: "hsl(0, 0%, 65%)", // medium light gray
      configKeyword: "hsl(340, 45%, 60%)", // darker pink
      audioKeyword: "hsl(180, 35%, 75%)", // soft cyan
    },
  },
];

/**
 * Parse an HSL string into components
 * Supports both "hsl(h, s%, l%)" and "hsl(h s% l%)" formats
 */
function parseHSL(hslString: string): { h: number; s: number; l: number } {
  const match = hslString.match(/hsl\((\d+(?:\.\d+)?)\s*[,]\s*(\d+(?:\.\d+)?)%\s*[,]\s*(\d+(?:\.\d+)?)%\)/);
  if (!match) {
    // Fallback for space-separated format (shouldn't happen after our fixes)
    const spaceMatch = hslString.match(/hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\)/);
    if (spaceMatch) {
      return { h: parseFloat(spaceMatch[1]), s: parseFloat(spaceMatch[2]), l: parseFloat(spaceMatch[3]) };
    }
    return { h: 0, s: 0, l: 50 };
  }
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

/**
 * Derive a light theme color from a dark theme HSL color
 * Light themes need darker colors for contrast on light backgrounds
 */
function deriveLightColor(hslString: string): string {
  const { h, s, l } = parseHSL(hslString);

  // For light theme: reduce lightness significantly for contrast
  // Adjust saturation based on original saturation to maintain color character
  let newL = Math.max(25, l - 25); // Reduce lightness by ~25%, min 25%
  let newS = s;

  // Increase saturation slightly for low-lightness colors to prevent washing out
  if (newL < 40 && s < 60) {
    newS = Math.min(100, s + 10);
  }

  return `hsl(${h}, ${newS}%, ${newL}%)`;
}

/**
 * Apply a palette to the document by setting CSS custom properties
 * Sets both dark and light theme variants
 */
export function applyPalette(palette: SyntaxPalette): void {
  const root = document.documentElement;
  const keyMap: Record<string, string> = {
    configKeyword: "config-keyword",
    audioKeyword: "audio-keyword",
  };

  Object.entries(palette.colors).forEach(([key, value]) => {
    const cssKey = keyMap[key] || key;
    // Set dark theme color (used by default)
    root.style.setProperty(`--${cssKey}`, value);
    // Set light theme variant (derived from dark)
    root.style.setProperty(`--${cssKey}-light`, deriveLightColor(value));
  });
}

/**
 * Get the current palette from local storage or return the first one
 */
export function getSavedPalette(): number {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return 0;
    }
    const saved = window.localStorage.getItem("branchforge-syntax-palette");
    if (saved === null) {
      return 0;
    }
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Save the selected palette index to local storage
 */
export function savePalette(index: number): void {
  localStorage.setItem("branchforge-syntax-palette", index.toString());
}
