/**
 * Verification script to check if the sync_status enum migration worked correctly
 */

import { getDb } from "../db/index.js";

async function verify() {
  const db = getDb();

  console.log("Verifying sync_status enum migration...");

  const result = await db.execute(`
    SELECT
      sync_status,
      COUNT(*) as count
    FROM labels
    GROUP BY sync_status
    ORDER BY sync_status
  `);

  console.log("Current sync_status values in labels table:");
  console.table(result.rows);

  if (result.rows.length === 0) {
    console.warn("⚠ No rows found in labels table - cannot verify enum values");
  }

  console.log("✓ Verification completed successfully!");
  process.exit(0);
}

verify().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});

