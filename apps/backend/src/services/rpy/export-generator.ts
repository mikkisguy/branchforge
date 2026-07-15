import { escapeRenpyString } from "../rpy-generator.service.js";
import type { BranchForgeScene, ParsedRPYFileWithLabels } from "./types.js";
import { extractTechnicalConstructsFromLines } from "./technical-constructs.js";

/**
 * Convert label-aware parsed data to BranchForge scene format
 * This is the fixed version that only returns dialogue for the specific label.
 *
 * @param parsed - The parsed RPY file with label boundaries
 * @param labelName - The label name to convert
 * @param originalContent - Optional original RPY content to extract line numbers and indent levels
 * @returns BranchForge scene with only this label's dialogue
 */
export function convertToBranchForgeFormatFromLabels(
  parsed: ParsedRPYFileWithLabels,
  labelName: string,
  originalContent?: string
): BranchForgeScene {
  const labelData = parsed.labels.find((l) => l.label === labelName);

  if (!labelData) {
    return {
      name: labelName,
      entries: [],
      characters: [],
    };
  }

  const entries: BranchForgeScene["entries"] = [];

  // Pre-split original content into lines array once for efficient lookups
  const originalLines = originalContent ? originalContent.split("\n") : [];

  // Helper function to get indent level from original content
  const getIndentLevel = (lineNumber: number): number => {
    if (originalLines.length === 0) return 0;
    if (lineNumber < 1 || lineNumber > originalLines.length) return 0;
    const line = originalLines[lineNumber - 1];
    // Count leading spaces/tabs (convert tabs to 4 spaces for consistency)
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    const indent = match[1].replace(/\t/g, "    ").length;
    // Return indent level in increments of 4 spaces (common RPY convention)
    return Math.floor(indent / 4);
  };

  // Add dialogue entries for THIS label only
  for (const d of labelData.dialogue) {
    // Skip empty dialogue text
    if (!d.text || d.text.trim().length === 0) {
      continue;
    }
    entries.push({
      type: d.speaker ? "DIALOGUE" : "NARRATION",
      speaker: d.speaker || undefined,
      text: d.text,
      lineNumber: d.lineNumber,
      indentLevel: getIndentLevel(d.lineNumber),
    });
  }

  // Add menu entries (as MENU type with menuOptions) for THIS label
  // Use the first choice option's line number so the MENU entry sorts AFTER
  // any caption text (narration lines between `menu:` and the first choice)
  if (labelData.menus && labelData.menus.length > 0) {
    for (const menu of labelData.menus) {
      // Use first option's line number for sort ordering; fall back to
      // the menu keyword's line if there are no options (shouldn't happen)
      const sortLineNumber =
        menu.options.length > 0 ? menu.options[0].lineNumber : menu.lineNumber;
      entries.push({
        type: "MENU",
        lineNumber: sortLineNumber,
        indentLevel: getIndentLevel(menu.lineNumber),
        menuOptions: menu.options.map((o) => ({
          label: o.label,
          targetLabelId: o.target || "",
          targetLabelName: o.target || "",
          conditionFlags:
            o.conditionFlags && o.conditionFlags.length > 0
              ? o.conditionFlags
              : undefined,
          effects:
            o.effects && Object.keys(o.effects).length > 0
              ? { stats: o.effects }
              : undefined,
        })),
      });
    }
  } else {
    // Fallback to flat choices (backward compatible for old data)
    for (const c of labelData.choices) {
      entries.push({
        type: "FLAG",
        text: c.label,
        target: c.target || undefined,
        lineNumber: c.lineNumber,
        indentLevel: getIndentLevel(c.lineNumber),
      });
    }
  }

  // Collect line number ranges of menu choice bodies to avoid emitting jumps
  // that are inside menu blocks (those are handled by menuOptions emission).
  // Standalone jumps targeting the same label as a menu option are preserved.
  const menuBodyRanges: Array<{ start: number; end: number }> = [];
  if (labelData.menus) {
    for (const menu of labelData.menus) {
      for (const opt of menu.options) {
        if (opt.lineNumber) {
          // Menu body starts at the option line and continues for a few lines
          // (typically the jump + any stat/flag lines within the choice)
          const bodyEnd = opt.lineNumber + 5; // conservative estimate
          menuBodyRanges.push({ start: opt.lineNumber, end: bodyEnd });
        }
      }
    }
  }

  // Add jump entries for THIS label only, excluding those inside menu bodies
  for (const j of labelData.jumps) {
    const insideMenu = menuBodyRanges.some(
      (r) => j.lineNumber >= r.start && j.lineNumber <= r.end
    );
    if (!insideMenu) {
      entries.push({
        type: "JUMP",
        target: j.to,
        lineNumber: j.lineNumber,
        indentLevel: getIndentLevel(j.lineNumber),
      });
    }
  }

  // Extract visual statements (scene/show/hide) from original content
  if (originalLines.length > 0) {
    // Determine label's line boundaries
    const labelStartLine = labelData.lineNumber; // 1-indexed
    const labelIndex = parsed.labels.findIndex((l) => l.label === labelName);
    const nextLabel = parsed.labels[labelIndex + 1];
    const labelEndLine = nextLabel
      ? nextLabel.lineNumber - 1
      : originalLines.length;

    // Scan lines within label boundaries for scene/show/hide
    for (
      let i = labelStartLine;
      i <= labelEndLine && i <= originalLines.length;
      i++
    ) {
      const constructs = extractTechnicalConstructsFromLines(
        originalLines,
        i - 1
      ); // 0-indexed
      if (constructs.visuals && constructs.visuals.length > 0) {
        entries.push({
          type: "VISUAL",
          lineNumber: i,
          indentLevel: getIndentLevel(i),
          visuals: constructs.visuals,
        });
      }
    }
  }

  // Extract unique characters from this label's dialogue
  const characterSet = new Set<string>();
  for (const d of labelData.dialogue) {
    if (d.speaker) {
      characterSet.add(d.speaker);
    }
  }

  const characters = Array.from(characterSet).map((tag) => {
    const charDef = parsed.characters.find((c) => c.tag === tag);
    return {
      tag,
      name: charDef?.name || tag,
    };
  });

  return {
    name: labelName,
    entries: entries.sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0)),
    characters: characters.length > 0 ? characters : undefined,
  };
}

/**
 * Generate RPY file content from BranchForge scene data
 * This is the inverse of parsing - used for export
 */
export function generateRpyFile(scene: BranchForgeScene): string {
  const lines: string[] = [];

  // Start with label
  lines.push(`label ${scene.name}:`);
  lines.push("");

  // Add entries
  let inMenu = false;
  for (const entry of scene.entries) {
    if (entry.type === "DIALOGUE" && entry.speaker && entry.text) {
      // Close any open menu before dialogue
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    ${entry.speaker} "${escapeRenpyString(entry.text)}"`);
    } else if (entry.type === "NARRATION" && entry.text) {
      // Close any open menu before narration
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    "${escapeRenpyString(entry.text)}"`);
    } else if (
      entry.type === "MENU" &&
      entry.menuOptions &&
      entry.menuOptions.length > 0
    ) {
      const menuIndent = " ".repeat(
        entry.indentLevel ? entry.indentLevel * 4 : 4
      );
      const choiceIndent = menuIndent + "    ";
      const bodyIndent = choiceIndent + "    ";
      lines.push(`${menuIndent}menu:`);
      for (const opt of entry.menuOptions) {
        const conditionSuffix = opt.condition ? ` ${opt.condition}` : "";
        lines.push(
          `${choiceIndent}"${escapeRenpyString(opt.label)}"${conditionSuffix}:`
        );
        if (opt.effects?.stats) {
          for (const [stat, value] of Object.entries(opt.effects.stats)) {
            const op = value >= 0 ? "+=" : "-=";
            lines.push(`${bodyIndent}$ ${stat} ${op} ${Math.abs(value)}`);
          }
        }
        if (opt.targetLabelName) {
          lines.push(`${bodyIndent}jump ${opt.targetLabelName}`);
        }
      }
      inMenu = false;
    } else if (entry.type === "FLAG" && entry.text && entry.target) {
      // Open menu if not already open
      if (!inMenu) {
        lines.push(`    menu:`);
        inMenu = true;
      }
      lines.push(`        "${escapeRenpyString(entry.text)}":`);
      lines.push(`            jump ${entry.target}`);
    } else if (entry.type === "JUMP" && entry.target) {
      if (inMenu) {
        inMenu = false;
      }
      lines.push(`    jump ${entry.target}`);
    } else if (entry.type === "VISUAL" && entry.visuals) {
      if (inMenu) {
        inMenu = false;
      }
      const indent = " ".repeat(entry.indentLevel ? entry.indentLevel * 4 : 4);
      for (const v of entry.visuals) {
        if (v.type === "SCENE") {
          let line = `${indent}scene ${v.target}`;
          if (v.with) line += ` with ${v.with}`;
          lines.push(line);
        } else if (v.type === "SHOW") {
          let line = `${indent}show ${v.target}`;
          if (v.at) line += ` at ${v.at}`;
          if (v.zorder !== undefined) line += ` zorder ${v.zorder}`;
          if (v.with) line += ` with ${v.with}`;
          lines.push(line);
        } else if (v.type === "HIDE") {
          let line = `${indent}hide ${v.target}`;
          if (v.with) line += ` with ${v.with}`;
          lines.push(line);
        }
      }
    }
  }

  lines.push("");
  lines.push("    return");

  return lines.join("\n");
}
