/**
 * RPY Content Generator
 *
 * Converts LabelDetail to syntax-highlighted display format for the ScriptEditor.
 * Produces HTML fragments compatible with the existing ScriptEditor component.
 */

import type { LabelDetail, PublicLabel } from "@branchforge/shared";

/**
 * Generate RPY content as HTML fragments with syntax highlighting
 * @param label - The label detail to convert
 * @returns Array of HTML strings with syntax highlighting classes
 */
export function generateRpyContent(label: LabelDetail): string[] {
  const lines: string[] = [];

  // Header comments
  lines.push(
    `<span class="text-muted-foreground"># Label: ${escapeHtml(
      label.title
    )}</span>`
  );
  if (label.groupType && label.groupValue) {
    lines.push(
      `<span class="text-muted-foreground"># ${label.groupType}: ${escapeHtml(
        label.groupValue
      )}</span>`
    );
  }
  if (label.routeKey) {
    lines.push(
      `<span class="text-muted-foreground"># Route: ${escapeHtml(
        label.routeKey
      )}</span>`
    );
  }
  lines.push("");

  // Label definition (convert title to valid Ren'Py label)
  // Sanitize: only allow [a-z0-9_], replace invalid chars with underscore
  const labelName = label.title
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores
  lines.push(
    `<span class="text-purple-400">label</span> <span class="text-blue-400">${escapeHtml(
      labelName
    )}</span><span class="text-muted-foreground">:</span>`
  );
  lines.push("");

  // Label lines
  for (const line of label.lines) {
    if (line.contentType === "DIALOGUE" && line.speakerTag) {
      // Dialogue line: e "Hello"
      lines.push(
        `    <span class="text-blue-400">${escapeHtml(
          line.speakerTag
        )}</span> <span class="text-green-400">"${escapeHtml(
          line.content
        )}"</span>`
      );
    } else if (line.contentType === "NARRATION") {
      // Narration line: "The story..."
      lines.push(
        `    <span class="text-green-400">"${escapeHtml(line.content)}"</span>`
      );
    } else if (line.contentType === "JUMP") {
      // Jump statement: jump other_label
      lines.push(
        `    <span class="text-purple-400">${escapeHtml(line.content)}</span>`
      );
    } else if (line.contentType === "MENU") {
      // Menu starts
      lines.push(
        `    <span class="text-yellow-400">menu</span><span class="text-muted-foreground">:</span>`
      );
    } else if (line.contentType === "CHOICE") {
      // Choice option: "Choice text":
      lines.push(
        `        <span class="text-green-400">"${escapeHtml(
          line.content
        )}"</span><span class="text-muted-foreground">:</span>`
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
 * Generate file tree structure from labels
 * Groups labels by groupType/groupValue for hierarchical display
 */
export interface FileItem {
  name: string;
  type: "folder" | "file";
  labelId?: string;
  children?: FileItem[];
}

export function generateFileTree(labels: PublicLabel[]): FileItem[] {
  if (!labels.length) return [];

  // Group by groupType/groupValue for hierarchical display
  const grouped = labels.reduce((acc, label) => {
    // Use group value if available, otherwise "Main"
    const key =
      label.groupType && label.groupValue
        ? `${label.groupType} ${label.groupValue}`
        : "Main";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(label);
    return acc;
  }, {} as Record<string, PublicLabel[]>);

  // Convert to file tree structure
  return Object.entries(grouped)
    .map(([groupName, groupLabels]) => ({
      name: groupName,
      type: "folder" as const,
      children: groupLabels.map((label) => ({
        name: `${label.title}.rpy`,
        type: "file" as const,
        labelId: label.id,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
