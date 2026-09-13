#!/usr/bin/env node

/**
 * Seed documentation demo data.
 *
 * Creates a deterministic demo user and project for docs screenshots and
 * local evaluation. Re-running rebuilds only this demo project.
 *
 * Usage:
 *   pnpm db:seed:docs-demo
 *
 * Login:
 *   Email:    docs-demo@branchforge.test
 *   Password: docsdemo123
 *
 * Dev-only — refuses production and staging environments.
 */

import {
  DOCS_DEMO_EMAIL,
  DOCS_DEMO_PASSWORD,
  DOCS_DEMO_PROJECT_NAME,
  seedDocsDemo,
} from "../src/services/docs-demo-seed.service.js";

async function main() {
  console.log("🌱 Seeding BranchForge docs demo data...\n");

  const result = await seedDocsDemo();

  console.log(`✅ Demo user: ${DOCS_DEMO_EMAIL}`);
  console.log(`✅ Demo project: ${DOCS_DEMO_PROJECT_NAME}`);
  console.log(`✅ Labels synced: ${result.labelCount}`);
  console.log(`✅ Story files: ${result.fileCount}`);
  console.log("\nLogin credentials:");
  console.log(`  Email:    ${DOCS_DEMO_EMAIL}`);
  console.log(`  Password: ${DOCS_DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error("❌ Docs demo seed failed:", error);
  process.exit(1);
});
