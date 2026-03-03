const fs = require("fs");
const path = require("path");

function consolidateChangelogs() {
  const packages = [
    { name: "frontend", changelogPath: "apps/frontend/CHANGELOG.md" },
    { name: "backend", changelogPath: "apps/backend/CHANGELOG.md" },
    { name: "shared", changelogPath: "packages/shared/CHANGELOG.md" },
  ];

  const rootChangelogPath = "CHANGELOG.md";
  let rootChangelog = fs.existsSync(rootChangelogPath)
    ? fs.readFileSync(rootChangelogPath, "utf-8")
    : "# Changelog\n\n";

  // Find the current version from package.json
  const { version } = require("../package.json");

  // Collect all changes for this version
  const added = [];
  const changed = [];
  const fixed = [];
  const removed = [];
  const other = [];

  for (const pkg of packages) {
    const changelogPath = pkg.changelogPath;
    if (!fs.existsSync(changelogPath)) continue;

    const changelog = fs.readFileSync(changelogPath, "utf-8");

    // Extract changes for this version
    const versionRegex = new RegExp(`## ${version}\\s*\\n([\\s\\S]*?)(?=## \\d|\\z)`, "i");
    const match = changelog.match(versionRegex);

    if (match && match[1]) {
      const content = match[1].trim();

      // Parse sections
      const sections = content.split("###").slice(1);
      for (const section of sections) {
        const lines = section.trim().split("\n");
        const type = lines[0].toLowerCase().trim();
        const items = lines.slice(1).filter((line) => line.trim().startsWith("-"));

        for (const item of items) {
          const cleanItem = item.replace(/^\-\s*/, "").trim();
          if (cleanItem) {
            if (type === "added" || type === "minor changes") {
              added.push(cleanItem);
            } else if (type === "changed") {
              changed.push(cleanItem);
            } else if (type === "fixed" || type === "patch changes") {
              fixed.push(cleanItem);
            } else if (type === "removed") {
              removed.push(cleanItem);
            } else {
              other.push(cleanItem);
            }
          }
        }
      }
    }

    // Remove the package changelog
    fs.unlinkSync(changelogPath);
  }

  // Build the consolidated changelog entry
  const lines = [`## [${version}] - ${new Date().toISOString().split("T")[0]}`];

  if (added.length > 0) {
    lines.push("\n### Added");
    added.forEach((item) => lines.push(`- ${item}`));
  }

  if (changed.length > 0) {
    lines.push("\n### Changed");
    changed.forEach((item) => lines.push(`- ${item}`));
  }

  if (fixed.length > 0) {
    lines.push("\n### Fixed");
    fixed.forEach((item) => lines.push(`- ${item}`));
  }

  if (removed.length > 0) {
    lines.push("\n### Removed");
    removed.forEach((item) => lines.push(`- ${item}`));
  }

  if (other.length > 0) {
    lines.push("\n### Other");
    other.forEach((item) => lines.push(`- ${item}`));
  }

  // Update root changelog
  const versionRegex = /## \[?\d+\.\d+\.\d+\]?/;
  if (versionRegex.test(rootChangelog)) {
    rootChangelog = rootChangelog.replace(
      versionRegex,
      lines.join("\n") + "\n\n$&"
    );
  } else {
    rootChangelog += "\n" + lines.join("\n") + "\n";
  }

  fs.writeFileSync(rootChangelogPath, rootChangelog);
  console.log(`✅ Consolidated changelog for v${version}`);
}

consolidateChangelogs();
