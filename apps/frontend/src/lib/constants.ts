import type { ThemePalette } from "@/contexts/ThemeContext";

export const BASE_URL =
  import.meta.env.VITE_API_ENV === "development" ? "/" : "/";

export const themePalettes: { name: string; key: ThemePalette; color: string }[] = [
  { name: "Forest", key: "forest", color: "#40bb82" },
  { name: "Periwinkle", key: "periwinkle", color: "#3d4ac2" },
  { name: "Dark Amethyst", key: "dark-amethyst", color: "#9549b6" },
  { name: "Graphite", key: "graphite", color: "#9ca3af" },
];
