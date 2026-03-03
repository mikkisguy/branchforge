const fs = require("fs");
const path = require("path");

function getReleaseLine(changesets, type) {
  if (type === "none") return "";

  const lines = [];

  // Group changes by type
  const added = [];
  const changed = [];
  const fixed = [];
  const removed = [];

  for (const changeset of changesets) {
    const commit = changeset.commit;
    const summary = changeset.summary;

    // Categorize based on summary or changeset type
    if (summary.toLowerCase().startsWith("feat") || summary.toLowerCase().startsWith("add")) {
      added.push(`${commit ? `${commit}: ` : ""}${summary}`);
    } else if (summary.toLowerCase().startsWith("fix") || summary.toLowerCase().startsWith("fix:")) {
      fixed.push(`${commit ? `${commit}: ` : ""}${summary}`);
    } else if (summary.toLowerCase().startsWith("refactor") || summary.toLowerCase().startsWith("change")) {
      changed.push(`${commit ? `${commit}: ` : ""}${summary}`);
    } else if (summary.toLowerCase().startsWith("remove") || summary.toLowerCase().startsWith("delete")) {
      removed.push(`${commit ? `${commit}: ` : ""}${summary}`);
    } else {
      // Default to "Added" for uncategorized
      added.push(`${commit ? `${commit}: ` : ""}${summary}`);
    }
  }

  if (added.length > 0) {
    lines.push("### Added");
    added.forEach((line) => lines.push(`- ${line}`));
  }

  if (changed.length > 0) {
    lines.push("### Changed");
    changed.forEach((line) => lines.push(`- ${line}`));
  }

  if (fixed.length > 0) {
    lines.push("### Fixed");
    fixed.forEach((line) => lines.push(`- ${line}`));
  }

  if (removed.length > 0) {
    lines.push("### Removed");
    removed.forEach((line) => lines.push(`- ${line}`));
  }

  return lines.join("\n");
}

function getVersionLine(version) {
  return `## [${version}] - ${new Date().toISOString().split("T")[0]}`;
}

function getDefaultChangelog() {
  return fs.readFileSync(path.join(__dirname, "../CHANGELOG.md"), "utf-8");
}

function updateRootChangelog(newRelease, version) {
  const changelogPath = path.join(__dirname, "../CHANGELOG.md");
  let changelog = fs.readFileSync(changelogPath, "utf-8");

  // Find the Unreleased section or create it
  const unreleasedRegex = /## Unreleased\n/;
  const versionRegex = /## \[?\d+\.\d+\.\d+\]?/;

  if (unreleasedRegex.test(changelog)) {
    // Replace Unreleased with the new version
    changelog = changelog.replace(
      unreleasedRegex,
      `${getVersionLine(version)}\n${newRelease}\n\n## Unreleased\n`
    );
  } else if (versionRegex.test(changelog)) {
    // Insert before the first version
    changelog = changelog.replace(
      versionRegex,
      `${getVersionLine(version)}\n${newRelease}\n\n$&`
    );
  } else {
    // No versions yet, add at the end
    changelog += `\n${getVersionLine(version)}\n${newRelease}\n`;
  }

  fs.writeFileSync(changelogPath, changelog);
}

// Changesets expects a default export
module.exports = {
  getReleaseLine,
  getVersionLine,
  getDefaultChangelog,
  updateRootChangelog,
  // Return empty string for package changelogs - we only want root
  getChangelog: (changesets, affectedPackages, options) => {
    const version = options.package.version;
    const newRelease = getReleaseLine(changesets, options.type);

    // Update root changelog
    updateRootChangelog(newRelease, version);

    // Return empty string for package changelogs
    return "";
  },
};
