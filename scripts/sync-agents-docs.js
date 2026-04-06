const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "AGENTS.md");
const claudePath = path.join(__dirname, "..", ".claude", "CLAUDE.md");
const copilotPath = path.join(__dirname, "..", ".github", "copilot-instructions.md");

try {
  const content = fs.readFileSync(sourcePath, "utf-8");

  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  fs.mkdirSync(path.dirname(copilotPath), { recursive: true });

  fs.writeFileSync(claudePath, content, "utf-8");
  fs.writeFileSync(copilotPath, content, "utf-8");

  console.log("✓ Synced AGENTS.md to:");
  console.log("  - .claude/CLAUDE.md");
  console.log("  - .github/copilot-instructions.md");
} catch (error) {
  console.error("Error syncing files:", error.message);
  process.exit(1);
}
