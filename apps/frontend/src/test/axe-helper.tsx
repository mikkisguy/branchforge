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
import { DARK_TOKENS, LIGHT_TOKENS, tokensToVars } from "./theme-tokens";

// ---------------------------------------------------------------------------
// CSS variable presets matching index.css :root (dark) and .light blocks
// ---------------------------------------------------------------------------

/** Dark-mode CSS variables — mirrors index.css :root block. */
const DARK_VARS: Record<string, string> = {
  ...tokensToVars(DARK_TOKENS),
  "--radius": "0.5rem",
  "--focus-ring-width": "3px",
  "--focus-ring-color": "108 30% 40%",
  // Theme accent (periwinkle default)
  "--theme-color": "#5b6ae0",
  "--theme-color-rgb": "91, 106, 224",
  "--theme-color-hover": "#727ae8",
  "--theme-foreground": "#ffffff",
  "--theme-foreground-hover": "#0a0a0a",
  "--theme-border": "rgba(91, 106, 224, 0.3)",
  "--surface-tint": "transparent",
};

/** Light-mode CSS variables — mirrors index.css .light block. */
const LIGHT_VARS: Record<string, string> = {
  ...tokensToVars(LIGHT_TOKENS),
  "--radius": "0.5rem",
  "--focus-ring-width": "3px",
  "--focus-ring-color": "222 47% 11%",
  // Theme accent (periwinkle, same color)
  "--theme-color": "#5b6ae0",
  "--theme-color-rgb": "91, 106, 224",
  "--theme-color-hover": "#727ae8",
  "--theme-foreground": "#ffffff",
  "--theme-foreground-hover": "#0a0a0a",
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
export function renderForAxe(
  ui: ReactNode,
  darkMode = false
): RenderResult & { cleanup: () => void } {
  const mode = darkMode ? "dark" : "light";
  const cleanup = applyCSSVars(mode);
  const result = render(<>{ui}</>);
  return Object.assign(result, { cleanup });
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
  lightResult.cleanup();

  const darkResult = renderForAxe(ui, true);
  const darkViolations = await runAxe(darkResult.container, options);
  darkResult.unmount();
  darkResult.cleanup();

  return { light: lightViolations, dark: darkViolations };
}
