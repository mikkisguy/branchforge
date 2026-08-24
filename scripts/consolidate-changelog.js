const fs = require("fs");

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
  const changes = [];

  for (const pkg of packages) {
    const changelogPath = pkg.changelogPath;
    if (!fs.existsSync(changelogPath)) {
      console.log(
        `ℹ️  No CHANGELOG.md found for ${pkg.name} at ${changelogPath}`
      );
      continue;
    }

    const changelog = fs.readFileSync(changelogPath, "utf-8");
    console.log(`📖 Reading ${pkg.name} changelog from ${changelogPath}`);

    // Extract changes for this version (handles both "## 0.1.2" and "## [0.1.2]" formats)
    const versionRegex = new RegExp(
      `##\\s*\\[?${version}\\]?\\s*\\n([\\s\\S]*?)(?=##\\s*\\[?\\d|$)`,
      "i"
    );
    const match = changelog.match(versionRegex);

    if (!match || !match[1]) {
      console.log(`⚠️  No version ${version} entry found in ${pkg.name}`);
      console.log(
        `   Changelog content preview:\n${changelog
          .split("\n")
          .slice(0, 10)
          .join("\n")}`
      );
      // Don't delete the changelog if we couldn't parse it
      continue;
    }

    console.log(`✅ Found version ${version} entry in ${pkg.name}`);
    const content = match[1].trim();

    // Check if the content has subsections (### format)
    if (content.includes("###")) {
      // Parse sections - format with ### headings
      const sections = content.split("###").slice(1);
      for (const section of sections) {
        const lines = section.trim().split("\n");
        const type = lines[0].toLowerCase().trim();
        const sectionItems = [];

        // Collect items with their nested items, preserving structure
        let currentItem = null;
        for (const line of lines.slice(1)) {
          if (!line.trim()) continue;

          // Check if this is a top-level item (starts with - but not deeply indented)
          if (line.match(/^-/) && !line.match(/^\s{2,}-/)) {
            // Save previous item with its nested items
            if (currentItem) {
              sectionItems.push(currentItem.lines.join("\n"));
            }
            // Keep the original line formatting (including the -)
            currentItem = { lines: [line] };
          } else if (currentItem) {
            // This is either a nested item or continuation of current item
            currentItem.lines.push(line);
          }
        }
        // Don't forget the last item
        if (currentItem) {
          sectionItems.push(currentItem.lines.join("\n"));
        }

        // Add each item (with nested items included) to the changes list
        for (const item of sectionItems) {
          changes.push(item);
        }
      }
    } else {
      // Parse flat list - default changeset format
      const lines = content.split("\n");
      let currentItem = null;
      const flatItems = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.match(/^-/) && !line.match(/^\s{2,}-/)) {
          if (currentItem) {
            flatItems.push(currentItem.lines.join("\n"));
          }
          currentItem = { lines: [line] };
        } else if (currentItem) {
          currentItem.lines.push(line);
        }
      }
      if (currentItem) {
        flatItems.push(currentItem.lines.join("\n"));
      }

      for (const item of flatItems) {
        changes.push(`${pkg.name}: ${item}`);
      }
    }

    // Remove the package changelog only if we successfully processed it
    fs.unlinkSync(changelogPath);
    console.log(`🗑️  Removed ${pkg.name} CHANGELOG.md`);
  }

  // Only proceed if we found actual changes to consolidate
  if (changes.length === 0) {
    console.log(`ℹ️  No changes found to consolidate for v${version}`);
    console.log(
      `ℹ️  Package CHANGELOG.md files left unchanged for inspection.`
    );
    process.exit(0);
  }

  // Deduplicate items (same content may appear in multiple packages)
  const unique = (arr) => [...new Set(arr)];
  const dedupedChanges = unique(changes);

  // Build the consolidated changelog entry
  const lines = [
    `## v${version} - ${new Date().toISOString().split("T")[0]}`,
    "",
    ...dedupedChanges,
  ];

  // Update root changelog
  const versionRegex = /## v?\[?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\]?/;
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

  // Update the version badge in README.md to match the new version
  const readmePath = "README.md";
  if (fs.existsSync(readmePath)) {
    let readme = fs.readFileSync(readmePath, "utf-8");
    // Shields splits badge path fields on `-`. Escape prerelease hyphens
    // so `1.0.0-beta.0` becomes `1.0.0--beta.0` in the URL while still
    // displaying as `1.0.0-beta.0`. Match both escaped and raw forms.
    const shieldsVersion = version.replaceAll("-", "--");
    readme = readme.replace(
      /version-\d+\.\d+\.\d+(?:-{1,2}[0-9A-Za-z.]+)?-yellow/,
      `version-${shieldsVersion}-yellow`
    );
    fs.writeFileSync(readmePath, readme);
    console.log(`✅ Updated README.md version badge to v${version}`);
  }
}

consolidateChangelogs();
