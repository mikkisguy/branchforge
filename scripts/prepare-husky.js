#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const isProduction = process.env.NODE_ENV === "production";
const hasHuskyBinary = existsSync("./node_modules/.bin/husky");

if (isProduction || !hasHuskyBinary) {
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "husky"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  process.exit(1);
}

process.exit(result.status ?? 0);
