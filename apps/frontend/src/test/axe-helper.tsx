/**
 * Axe-core test helpers for accessibility contrast scanning.
 *
 * Sets CSS custom properties directly on document.documentElement rather than
 * going through ThemeProvider (which requires QueryClient + Toast providers).
 * This keeps tests focused on contrast alone and avoids cascading context deps.
 */
import axe, { type AxeResults } from "axe-core";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// CSS variable presets matching index.css :root (dark) and .light blocks
// ---------------------------------------------------------------------------

/** Dark-mode CSS variables — mirrors index.css :root block. */
const DARK_VARS: Record<string, string> = {
  "--background": "0 0% 6%",
  "--foreground": "0 0% 95%",
  "--card": "0 0% 8%",
  "--card-foreground": "0 0% 95%",
  "--popover": "0 0% 6%",
  "--popover-foreground": "0 0% 95%",
  "--primary": "0 0% 98%",
  "--primary-foreground": "0 0% 9%",
  "--secondary": "0 0% 14%",
  "--secondary-foreground": "0 0% 90%",
  "--muted": "0 0% 14%",
  "--muted-foreground": "0 0% 55%",
  "--accent": "0 0% 14%",
  "--accent-foreground": "0 0% 90%",
  "--destructive": "0 62.8% 30.6%",
  "--destructive-foreground": "0 0% 98%",
  "--destructive-muted": "0 70% 55%",
  "--border": "0 0% 20%",
  "--input": "0 0% 18%",
  "--ring": "0 0% 70%",
  "--radius": "0.5rem",
  "--focus-ring-width": "3px",
  "--focus-ring-color": "108 30% 40%",
  // Theme accent (periwinkle default)
  "--theme-color": "#5b6ae0",
  "--theme-color-rgb": "91, 106, 224",
  "--theme-color-hover": "#727ae8",
  "--theme-foreground": "#ffffff",
  "--theme-border": "rgba(91, 106, 224, 0.3)",
  "--surface-tint": "transparent",
};

/** Light-mode CSS variables — mirrors index.css .light block. */
const LIGHT_VARS: Record<string, string> = {
  "--background": "220 20% 97%",
  "--foreground": "222 47% 11%",
  "--card": "220 25% 99%",
  "--card-foreground": "222 47% 11%",
  "--popover": "220 25% 99%",
  "--popover-foreground": "222 47% 11%",
  "--primary": "222 47% 11%",
  "--primary-foreground": "210 40% 98%",
  "--secondary": "220 16% 92%",
  "--secondary-foreground": "222 47% 11%",
  "--muted": "220 15% 93%",
  "--muted-foreground": "220 10% 38%",
  "--accent": "220 30% 94%",
  "--accent-foreground": "222 47% 11%",
  "--destructive": "0 72% 48%",
  "--destructive-foreground": "0 0% 98%",
  "--destructive-muted": "0 75% 45%",
  "--border": "214 20% 88%",
  "--input": "214 20% 88%",
  "--ring": "222 47% 11%",
  "--focus-ring-color": "222 47% 11%",
  // Theme accent (periwinkle, same color)
  "--theme-color": "#5b6ae0",
  "--theme-color-rgb": "91, 106, 224",
  "--theme-color-hover": "#727ae8",
  "--theme-foreground": "#ffffff",
  "--theme-border": "rgba(91, 106, 224, 0.3)",
  "--surface-tint": "rgba(91, 106, 224, 0.04)",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationSeverity = "critical" | "serious" | "moderate" | "minor";

export interface ContrastViolation {
  id: string;
  impact: ViolationSeverity;
  description: string;
  helpUrl: string;
  nodes: number;
  html: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run axe-core on a container. Returns flattened violations.
 * Defaults to WCAG AA rules; pass `allRules: true` to scan everything.
 */
export async function runAxe(
  container: HTMLElement,
  options?: { allRules?: boolean }
): Promise<ContrastViolation[]> {
  const results: AxeResults = await axe.run(container, {
    runOnly: options?.allRules ? undefined : ["wcag2aa", "wcag21aa"],
  });

  return results.violations.map((v) => ({
    id: v.id,
    impact: (v.impact ?? "moderate") as ViolationSeverity,
    description: v.description,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    html: v.nodes.slice(0, 3).map((n) => n.html),
  }));
}

/**
 * Format violations into a readable report.
 */
export function formatViolations(violations: ContrastViolation[]): string {
  if (violations.length === 0) return "No violations found.";
  return violations
    .map(
      (v) =>
        `[${v.impact.toUpperCase()}] ${v.id}: ${v.description}\n` +
        `  Nodes affected: ${v.nodes}\n` +
        `  Help: ${v.helpUrl}\n` +
        v.html.map((h, i) => `  HTML[${i}]: ${h}`).join("\n")
    )
    .join("\n\n");
}

/**
 * Apply CSS variables for a given mode and return a cleanup function.
 */
function applyCSSVars(mode: "light" | "dark"): () => void {
  const root = document.documentElement;
  const vars = mode === "dark" ? DARK_VARS : LIGHT_VARS;
  const prev: Record<string, string> = {};

  for (const [prop, value] of Object.entries(vars)) {
    prev[prop] = root.style.getPropertyValue(prop);
    root.style.setProperty(prop, value);
  }

  // Toggle classes
  root.classList.remove("dark", "light");
  root.classList.add(mode);

  return () => {
    for (const [prop, value] of Object.entries(prev)) {
      if (value) {
        root.style.setProperty(prop, value);
      } else {
        root.style.removeProperty(prop);
      }
    }
    root.classList.remove("dark", "light");
  };
}

/**
 * Render a component with the given mode's CSS variables applied.
 */
export function renderForAxe(ui: ReactNode, darkMode = false): RenderResult {
  const mode = darkMode ? "dark" : "light";
  applyCSSVars(mode);
  return render(<>{ui}</>);
}

/**
 * Test a component in both light and dark modes.
 */
export async function testInBothModes(
  ui: ReactNode,
  options?: { allRules?: boolean }
): Promise<{ light: ContrastViolation[]; dark: ContrastViolation[] }> {
  const lightResult = renderForAxe(ui, false);
  const lightViolations = await runAxe(lightResult.container, options);
  lightResult.unmount();

  const darkResult = renderForAxe(ui, true);
  const darkViolations = await runAxe(darkResult.container, options);
  darkResult.unmount();

  return { light: lightViolations, dark: darkViolations };
}
