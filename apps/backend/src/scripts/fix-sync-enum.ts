/**
 * Migration script to fix sync_status enum values
 * Maps old enum values to new ones before applying schema changes
 */

import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

async function migrate() {
  const db = getDb();

  console.log("Migrating sync_status enum values...");

  // Step 1: Convert columns to text type to allow any value
  console.log("Converting columns to text...");
  await db.execute(
    sql`ALTER TABLE labels ALTER COLUMN sync_status SET DATA TYPE text`,
  );
  await db.execute(
    sql`ALTER TABLE gitlab_file_sync_state ALTER COLUMN status SET DATA TYPE text`,
  );
  await db.execute(
    sql`ALTER TABLE gitlab_sync_operations ALTER COLUMN status SET DATA TYPE text`,
  );
  console.log("✓ Converted columns to text");

  // Step 2: Update the data
  console.log("Updating data to new enum values...");

  // Update labels table
  await db.execute(sql`
    UPDATE labels
    SET sync_status = CASE
      WHEN sync_status = 'completed' THEN 'synced'
      WHEN sync_status = 'pending' THEN 'modified_local'
      WHEN sync_status = 'in_progress' THEN 'modified_local'
      WHEN sync_status = 'failed' THEN 'conflict'
      ELSE 'synced'
    END
  `);
  console.log("✓ Updated labels.sync_status");

  // Update gitlab_file_sync_state table
  await db.execute(sql`
    UPDATE gitlab_file_sync_state
    SET status = CASE
      WHEN status = 'completed' THEN 'synced'
      WHEN status = 'pending' THEN 'modified_local'
      WHEN status = 'in_progress' THEN 'modified_local'
      WHEN status = 'failed' THEN 'conflict'
      ELSE 'synced'
    END
  `);
  console.log("✓ Updated gitlab_file_sync_state.status");

  // Update gitlab_sync_operations table
  await db.execute(sql`
    UPDATE gitlab_sync_operations
    SET status = CASE
      WHEN status = 'completed' THEN 'synced'
      WHEN status = 'pending' THEN 'modified_local'
      WHEN status = 'in_progress' THEN 'modified_local'
      WHEN status = 'failed' THEN 'conflict'
      ELSE 'synced'
    END
  `);
  console.log("✓ Updated gitlab_sync_operations.status");

  console.log("Data migration completed! Ready to apply schema changes.");
  process.exit(0);
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

