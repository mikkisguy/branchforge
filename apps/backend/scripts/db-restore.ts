/**
 * Database Restore Script
 *
 * Restores a database snapshot from a backup file.
 * Usage: pnpm db:restore <filename>
 *
 * WARNING: This will DELETE all existing data and replace it with the backup!
 */

import { Client } from 'pg';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as readline from 'readline';

async function confirmRestore(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: This will DELETE all existing data in the database!\n' +
        '    Type "yes" to confirm restore: ',
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      }
    );
  });
}

async function restoreBackup() {
  const filename = process.argv[2];

  if (!filename) {
    console.error('❌ Error: Please specify a backup file to restore');
    console.log('\nAvailable backups:');
    await listBackups();
    console.log('\nUsage: pnpm db:restore <filename>');
    process.exit(1);
  }

  const backupDir = resolve(process.cwd(), '../backups');
  const backupPath = resolve(backupDir, filename);

  if (!existsSync(backupPath)) {
    console.error(`❌ Error: Backup file not found: ${filename}`);
    console.log('\nAvailable backups:');
    await listBackups();
    process.exit(1);
  }

  // Show backup info
  const content = readFileSync(backupPath, 'utf-8');
  const lines = content.split('\n');
  console.log('\n📋 Backup Info:');
  console.log('   ', lines[0]?.replace('-- ', '') || 'Unknown date');
  console.log('   ', lines[1]?.replace('-- ', '') || 'Unknown database');

  // Get file size
  const { stat } = await import('fs/promises');
  const stats = await stat(backupPath);
  console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);

  // Confirm restore
  const confirmed = await confirmRestore();
  if (!confirmed) {
    console.log('❌ Restore cancelled');
    process.exit(0);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('\n🔄 Connecting to database...');

    // Execute the restore
    console.log('⏳ Restoring data...');
    await client.query(content);

    console.log('\n✅ Restore completed successfully!');
    console.log(`   Restored from: ${backupPath}`);
  } catch (error) {
    console.error('\n❌ Restore failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function listBackups() {
  const backupDir = resolve(process.cwd(), '../backups');
  const { readdir } = await import('fs/promises');

  try {
    const files = await readdir(backupDir);
    const backups = files.filter((f) => f.endsWith('.sql'));

    if (backups.length === 0) {
      console.log('   No backups found');
      return;
    }

    // Get stats for each file
    const { stat } = await import('fs/promises');
    const backupStats = await Promise.all(
      backups.map(async (f) => {
        const filePath = resolve(backupDir, f);
        const stats = await stat(filePath);
        return {
          name: f,
          size: (stats.size / 1024).toFixed(2) + ' KB',
          created: stats.mtime.toISOString(),
        };
      })
    );

    // Sort by creation date (newest first)
    backupStats.sort((a, b) => b.created.localeCompare(a.created));

    console.log('');
    backupStats.forEach((b) => {
      console.log(`   • ${b.name}`);
      console.log(`     Size: ${b.size} | Modified: ${b.created}`);
    });
  } catch {
    console.log('   No backups found (or cannot access backup directory)');
  }
}

// Run the restore
restoreBackup().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
