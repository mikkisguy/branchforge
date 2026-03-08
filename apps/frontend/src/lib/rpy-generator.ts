/**
 * RPY Content Generator
 *
 * Converts SceneDetail to syntax-highlighted display format for the ScriptEditor.
 * Produces HTML fragments compatible with the existing ScriptEditor component.
 */

import type { SceneDetail, PublicScene } from "@branchforge/shared";

/**
 * Generate RPY content as HTML fragments with syntax highlighting
 * @param scene - The scene detail to convert
 * @returns Array of HTML strings with syntax highlighting classes
 */
export function generateRpyContent(scene: SceneDetail): string[] {
  const lines: string[] = [];

  // Header comments
  lines.push(
    `<span class="text-muted-foreground"># Scene: ${escapeHtml(scene.title)}</span>`,
  );
  if (scene.groupType && scene.groupValue) {
    lines.push(
      `<span class="text-muted-foreground"># ${scene.groupType}: ${escapeHtml(scene.groupValue)}</span>`,
    );
  }
  if (scene.routeKey) {
    lines.push(
      `<span class="text-muted-foreground"># Route: ${escapeHtml(scene.routeKey)}</span>`,
    );
  }
  lines.push("");

  // Label definition (convert title to valid Ren'Py label)
  // Sanitize: only allow [a-z0-9_], replace invalid chars with underscore
  const labelName = scene.title
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores
  lines.push(
    `<span class="text-purple-400">label</span> <span class="text-blue-400">${escapeHtml(labelName)}</span><span class="text-muted-foreground">:</span>`,
  );
  lines.push("");

  // Scene lines
  for (const line of scene.lines) {
    if (line.contentType === "DIALOGUE" && line.speakerTag) {
      // Dialogue line: e "Hello"
      lines.push(
        `    <span class="text-blue-400">${escapeHtml(line.speakerTag)}</span> <span class="text-green-400">"${escapeHtml(line.content)}"</span>`,
      );
    } else if (line.contentType === "NARRATION") {
      // Narration line: "The story..."
      lines.push(
        `    <span class="text-green-400">"${escapeHtml(line.content)}"</span>`,
      );
    } else if (line.contentType === "JUMP") {
      // Jump statement: jump other_label
      lines.push(
        `    <span class="text-purple-400">${escapeHtml(line.content)}</span>`,
      );
    } else if (line.contentType === "MENU") {
      // Menu starts
      lines.push(
        `    <span class="text-yellow-400">menu</span><span class="text-muted-foreground">:</span>`,
      );
    } else if (line.contentType === "CHOICE") {
      // Choice option: "Choice text":
      lines.push(
        `        <span class="text-green-400">"${escapeHtml(line.content)}"</span><span class="text-muted-foreground">:</span>`,
      );
    }
  }

  lines.push("");
  lines.push(`<span class="text-purple-400">return</span>`);

  return lines;
}

/**
 * Escape HTML special characters in content
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate file tree structure from scenes
 * Groups scenes by groupType/groupValue for hierarchical display
 */
export interface FileItem {
  name: string;
  type: "folder" | "file";
  sceneId?: string;
  children?: FileItem[];
}

export function generateFileTree(scenes: PublicScene[]): FileItem[] {
  if (!scenes.length) return [];

  // Group by groupType/groupValue for hierarchical display
  const grouped = scenes.reduce(
    (acc, scene) => {
      // Use group value if available, otherwise "Main"
      const key =
        scene.groupType && scene.groupValue
          ? `${scene.groupType} ${scene.groupValue}`
          : "Main";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(scene);
      return acc;
    },
    {} as Record<string, PublicScene[]>,
  );

  // Convert to file tree structure
  return Object.entries(grouped)
    .map(([groupName, groupScenes]) => ({
      name: groupName,
      type: "folder" as const,
      children: groupScenes.map((scene) => ({
        name: `${scene.title}.rpy`,
        type: "file" as const,
        sceneId: scene.id,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

