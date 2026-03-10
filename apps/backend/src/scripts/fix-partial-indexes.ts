/**
 * Convert regular indexes to partial indexes for label_lines table
 */

import { getDb } from '../db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  const db = getDb();

  console.log('Converting regular indexes to partial indexes...');

  // Drop existing regular indexes
  console.log('Dropping regular indexes...');
  await db.execute(sql`DROP INDEX IF EXISTS label_lines_is_dirty_idx`);
  await db.execute(sql`DROP INDEX IF EXISTS label_lines_deleted_at_idx`);
  console.log('✓ Dropped regular indexes');

  // Create partial indexes
  console.log('Creating partial indexes...');
  await db.execute(sql`
    CREATE INDEX label_lines_is_dirty_idx
    ON label_lines (is_dirty)
    WHERE is_dirty = true
  `);
  console.log('✓ Created partial index on is_dirty');

  await db.execute(sql`
    CREATE INDEX label_lines_deleted_at_idx
    ON label_lines (deleted_at)
    WHERE deleted_at IS NULL
  `);
  console.log('✓ Created partial index on deleted_at');

  console.log('\n✅ Partial indexes created successfully!');
  process.exit(0);
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
