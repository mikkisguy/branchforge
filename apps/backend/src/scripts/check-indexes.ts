/**
 * Check current indexes on label_lines table
 */

import { getDb } from "../db/index.js";

interface PgIndex {
  indexname: string;
  indexdef: string;
}

async function checkIndexes() {
  const db = getDb();

  console.log("Checking indexes on label_lines table...\n");

  const result = await db.execute(`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = 'label_lines'
    ORDER BY indexname
  `);

  console.log("Current indexes:");
  console.table(result.rows);

  // Check specifically for our partial indexes
  const partialIndexes = result.rows.filter(
    (row: unknown) =>
      (row as PgIndex).indexname?.includes("is_dirty_idx") ||
      (row as PgIndex).indexname?.includes("deleted_at_idx"),
  );

  console.log("\n🎯 Partial Indexes Status:");
  if (partialIndexes.length > 0) {
    partialIndexes.forEach((idx: unknown) => {
      const typedIdx = idx as PgIndex;
      console.log(`✓ ${typedIdx.indexname}: ${typedIdx.indexdef}`);
    });

    process.exit(0);
  } else {
    console.log("❌ Partial indexes not found!");
    process.exit(1);
  }
}

checkIndexes().catch((error) => {
  console.error("Check failed:", error);
  process.exit(1);
});

