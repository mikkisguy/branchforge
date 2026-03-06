/**
 * List Database Backups
 *
 * Lists all available database backups with details.
 * Usage: pnpm db:list
 */

import { readdir } from 'fs/promises';
import { resolve } from 'path';
import { existsSync } from 'fs';

async function listBackups() {
  const backupDir = resolve(process.cwd(), '../backups');

  if (!existsSync(backupDir)) {
    console.log('No backups directory found. Create your first backup with: pnpm db:backup');
    return;
  }

  const files = await readdir(backupDir);
  const backups = files.filter((f) => f.endsWith('.sql'));

  if (backups.length === 0) {
    console.log('No backups found. Create your first backup with: pnpm db:backup');
    return;
  }

  console.log(`\n📦 Database Backups (${backups.length} total):\n`);

  // Get stats for each file
  const { stat } = await import('fs/promises');
  const backupStats = await Promise.all(
    backups.map(async (f) => {
      const filePath = resolve(backupDir, f);
      const stats = await stat(filePath);
      return {
        name: f,
        size: (stats.size / 1024).toFixed(2) + ' KB',
        created: stats.mtime.toLocaleString(),
      };
    })
  );

  // Sort by creation date (newest first)
  backupStats.sort((a, b) => b.created.localeCompare(a.created));

  backupStats.forEach((b, i) => {
    const prefix = i === 0 ? '🕐 ' : '   ';
    console.log(`${prefix}${b.name}`);
    console.log(`      Size: ${b.size} | Modified: ${b.created}`);
  });

  console.log(`\nRestore with: pnpm db:restore <filename>`);
}

listBackups().catch((err) => {
  console.error('Error listing backups:', err);
  process.exit(1);
});
