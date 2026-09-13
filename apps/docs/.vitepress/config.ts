import { defineConfig } from "vitepress";

// Single source of truth for repo links across the docs site.
const REPO_URL = "https://github.com/mikkisguy/branchforge";

function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function resolveSiteUrl(): string {
  const explicit = process.env.VITEPRESS_SITE_URL;
  if (explicit) {
    return normalizeSiteUrl(explicit);
  }

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) {
    return normalizeSiteUrl(vercelProduction);
  }

  const vercelPreview = process.env.VERCEL_URL;
  if (vercelPreview) {
    return normalizeSiteUrl(vercelPreview);
  }

  return "http://localhost:5173";
}

const siteUrl = resolveSiteUrl();

export default defineConfig({
  title: "BranchForge",
  description: "A creative workspace for Ren'Py visual novel writers",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [
    /^https?:\/\//,
    /\/dev\/adrs$/,
    /^\/dev\/adrs/,
    /DATABASE_SCHEMAS/,
  ],
  head: [
    ["link", { rel: "icon", href: "/favicon.png", type: "image/png" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "BranchForge" }],
    ["meta", { property: "og:image", content: `${siteUrl}/favicon.png` }],
    ["link", { rel: "canonical", href: siteUrl }],
  ],
  sitemap: {
    hostname: siteUrl,
  },
  appearance: true,
  themeConfig: {
    logo: "/favicon.png",
    siteTitle: "BranchForge",
    nav: [
      { text: "Home", link: "/" },
      { text: "Changelog", link: "/changelog" },
      { text: "User Guide", link: "/user/getting-started" },
      { text: "Developer Guide", link: "/dev/architecture" },
      { text: "GitHub", link: REPO_URL },
    ],
    sidebar: {
      "/user/": [
        {
          text: "Getting Started",
          items: [
            { text: "Installation", link: "/user/getting-started" },
            { text: "Your First Project", link: "/user/projects" },
            { text: "Organization", link: "/user/organization" },
          ],
        },
        {
          text: "Writing",
          items: [
            { text: "Write Mode", link: "/user/writing" },
            { text: "Script Mode", link: "/user/script-mode" },
            { text: "Flow Graph", link: "/user/flow-graph" },
            { text: "Routes & Visibility", link: "/user/routes" },
            { text: "File Management", link: "/user/files" },
          ],
        },
        {
          text: "Story Tools",
          items: [
            { text: "Characters & Stats", link: "/user/characters" },
            { text: "World Bible", link: "/user/world-bible" },
            { text: "Pair Groups", link: "/user/pair-groups" },
          ],
        },
        {
          text: "Import & Export",
          items: [{ text: "Import & Export", link: "/user/import-export" }],
        },
        {
          text: "Account",
          items: [
            { text: "Goals & Themes", link: "/user/settings" },
            { text: "Keyboard Shortcuts", link: "/user/keyboard-shortcuts" },
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
            { text: "Docs Site", link: "/dev/docs-site" },
            { text: "Decision Records", link: "/dev/adrs" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: REPO_URL }],
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
