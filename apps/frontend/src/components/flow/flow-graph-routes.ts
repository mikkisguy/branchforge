/**
 * Flow graph route / color helpers.
 */

import type { FlowNode, RouteConfig } from "@branchforge/shared";

/**
 * Build route options for the filters panel from flow nodes and configs.
 * Always includes an "Unassigned" bucket if any node lacks a routeKey.
 */
export function buildRouteOptions(
  flowNodes: readonly FlowNode[],
  routeConfigs: readonly RouteConfig[]
): Array<{ key: string | null; label: string }> {
  const presentKeys = new Set<string>();
  let hasUnassigned = false;
  for (const node of flowNodes) {
    if (node.routeKey) {
      presentKeys.add(node.routeKey);
    } else {
      hasUnassigned = true;
    }
  }
  const fromConfigs: Array<{ key: string; label: string }> = [];
  for (const c of routeConfigs) {
    if (presentKeys.has(c.routeKey)) {
      fromConfigs.push({ key: c.routeKey, label: c.routeName });
    }
  }
  const known = new Set(fromConfigs.map((r) => r.key));
  for (const k of presentKeys) {
    if (!known.has(k)) fromConfigs.push({ key: k, label: k });
  }
  fromConfigs.sort((a, b) => a.label.localeCompare(b.label));
  const options: Array<{ key: string | null; label: string }> = [
    ...fromConfigs,
  ];
  if (hasUnassigned) {
    options.push({ key: null, label: "Unassigned" });
  }
  return options;
}

export function getRouteColor(
  routeKey: string | null,
  routeColorMap: Map<string, string>
): string {
  if (!routeKey) return "#64748b"; // slate-500 for unassigned
  const color = routeColorMap.get(routeKey);
  return color ?? "#64748b";
}

/**
 * Convert HSL color to hex string.
 * @param h - Hue in degrees (0-360)
 * @param s - Saturation as percentage (0-100)
 * @param l - Lightness as percentage (0-100)
 * @returns 6-digit hex color string (e.g., "#a1b2c3")
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const toHex = (n: number): string => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * djb2 string hash. Stable, fast, and good enough distribution to spread
 * route keys across the 360-bucket hue space without clustering.
 */
function hashRouteKey(routeKey: string): number {
  let hash = 5381;
  for (let i = 0; i < routeKey.length; i++) {
    hash = ((hash << 5) + hash + routeKey.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Generate a deterministic color for a given hue (0-360) using HSL.
 * @param hue - Hue in degrees (0-360)
 * @returns 6-digit hex color string
 */
function generateHslColor(hue: number): string {
  const saturation = 70;
  const lightness = 55;
  return hslToHex(hue, saturation, lightness);
}

export function buildRouteColorMap(nodes: FlowNode[]): Map<string, string> {
  const routes = new Set<string>();
  for (const node of nodes) {
    if (node.routeKey) routes.add(node.routeKey);
  }
  const map = new Map<string, string>();
  for (const route of routes) {
    const hue = Math.abs(hashRouteKey(route)) % 360;
    map.set(route, generateHslColor(hue));
  }
  return map;
}
