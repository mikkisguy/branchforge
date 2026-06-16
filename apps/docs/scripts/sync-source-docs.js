/**
 * Syncs source documentation from docs/ into VitePress pages.
 *
 * Files stay in docs/ (for AI agents + GitHub readers). This script copies
 * them into apps/docs/ as real VitePress pages so they render as markdown,
 * not code blocks.
 *
 * Generated files are gitignored — always regenerated, never edited by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const docsSrc = resolve(root, "docs");
const docsDst = resolve(__dirname, "..");

// --- Architecture ---
// ADRs are kept in the repo only (linked from /dev/adrs, not rendered inline).
// To re-enable: add an ADR sync loop here that copies docs/adr/*.md into
// dev/adrs/ with prepended frontmatter. See git history for the original.
const architectureSrc = resolve(docsSrc, "ARCHITECTURE.md");

try {
  writeFileSync(
    resolve(docsDst, "dev/architecture.md"),
    `---\ntitle: Architecture\n---\n\n${readFileSync(
      architectureSrc,
      "utf-8"
    )}`
  );
} catch (err) {
  if (err && err.code === "ENOENT") {
    console.error(
      `[sync-source-docs] ${architectureSrc} not found.\n` +
        "Run this script from the repo root (pnpm docs:build / pnpm docs:dev), " +
        "or check that docs/ARCHITECTURE.md exists."
    );
    process.exit(1);
  }
  throw err;
}

console.log("✓ Synced 1 source doc(s) into VitePress pages.");
