/**
 * RPY Content Generator
 *
 * Converts LabelDetail to syntax-highlighted display format for the ScriptEditor.
 * Produces HTML fragments compatible with the existing ScriptEditor component.
 */

import type { LabelDetail, PublicLabel } from "@branchforge/shared";
import { sanitizeLabelName } from "./label-utils";

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
  const labelName = sanitizeLabelName(label.title);
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
 * Generate RPY content as plain text (no HTML)
 * @param label - The label detail to convert
 * @returns Plain text string with proper indentation and whitespace
 */
export function generateRpyPlainText(label: LabelDetail): string {
  const lines: string[] = [];

  // Header comments
  lines.push(`# Label: ${label.title}`);
  if (label.groupType && label.groupValue) {
    lines.push(`# ${label.groupType}: ${label.groupValue}`);
  }
  if (label.routeKey) {
    lines.push(`# Route: ${label.routeKey}`);
  }
  lines.push("");

  // Label definition (convert title to valid Ren'Py label)
  const labelName = sanitizeLabelName(label.title);

  lines.push(`label ${labelName}:`);
  lines.push("");

  // Label lines with proper indentation
  for (const line of label.lines) {
    if (line.contentType === "DIALOGUE" && line.speakerTag) {
      lines.push(`    ${line.speakerTag} "${escapeRenpyString(line.content)}"`);
    } else if (line.contentType === "NARRATION") {
      lines.push(`    "${escapeRenpyString(line.content)}"`);
    } else if (line.contentType === "JUMP") {
      lines.push(`    ${line.content}`);
    } else if (line.contentType === "MENU") {
      lines.push(`    menu:`);
    } else if (line.contentType === "CHOICE") {
      lines.push(`        "${escapeRenpyString(line.content)}":`);
    }
  }

  lines.push("");
  lines.push("return");

  return lines.join("\n");
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
 * Escape Ren'Py string content for double-quoted strings
 * Escapes backslashes, double quotes, and control characters
 */
function escapeRenpyString(text: string): string {
  let result = text;

  // Escape backslashes first (must be first to avoid double-escaping)
  result = result.replace(/\\/g, "\\\\");
  // Escape double quotes
  result = result.replace(/"/g, '\\"');
  // Escape common control characters
  result = result.replace(/\n/g, "\\n");
  result = result.replace(/\r/g, "\\r");
  result = result.replace(/\t/g, "\\t");
  result = result.replace(/\f/g, "\\f");
  result = result.replace(/\v/g, "\\v");
  result = result.replace(/\b/g, "\\b");

  // Escape remaining ASCII control characters (0x00-0x1F) except already handled
  // Manual iteration to avoid regex control character lint errors
  result = result.replace(/./g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 && !"\n\r\t\f\v\b".includes(ch)) {
      return `\\u${code.toString(16).padStart(4, "0")}`;
    }
    return ch;
  });

  return result;
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
  const grouped = labels.reduce(
    (acc, label) => {
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
    },
    {} as Record<string, PublicLabel[]>
  );

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
