import { defineConfig } from "vitepress";

// Single source of truth for repo links across the docs site.
// If the repo is renamed/forked/mirrored, update only this.
const REPO_URL = "https://github.com/mikkisguy/branchforge";

export default defineConfig({
  title: "BranchForge",
  description: "A creative workspace for Ren'Py visual novel writers",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "User Guide", link: "/user/getting-started" },
      { text: "Developer Guide", link: "/dev/architecture" },
      {
        text: "GitHub",
        link: REPO_URL,
      },
    ],
    sidebar: {
      "/user/": [
        {
          text: "Getting Started",
          items: [
            { text: "Installation", link: "/user/getting-started" },
            { text: "Your First Project", link: "/user/projects" },
          ],
        },
        {
          text: "Writing",
          items: [
            { text: "Write Mode", link: "/user/writing" },
            { text: "Script Mode", link: "/user/script-mode" },
            { text: "Flow Graph", link: "/user/flow-graph" },
            { text: "Import & Export", link: "/user/import-export" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Keyboard Shortcuts", link: "/user/keyboard-shortcuts" },
            { text: "Characters & Stats", link: "/user/characters" },
          ],
        },
      ],
      "/dev/": [
        {
          text: "Overview",
          items: [
            { text: "Architecture", link: "/dev/architecture" },
            { text: "Contributing", link: "/dev/contributing" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Database", link: "/dev/database" },
            { text: "API Reference", link: "/dev/api" },
            { text: "Decision Records", link: "/dev/adrs" },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        link: REPO_URL,
      },
    ],
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
    },
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});
