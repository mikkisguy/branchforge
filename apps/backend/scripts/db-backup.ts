/**
 * Database Backup Script
 *
 * Creates a snapshot of the database and saves it to a file.
 * Usage: pnpm db:backup [filename]
 *
 * The backup file contains:
 * - All table data (not schema - use migrations for schema)
 * - Formatted as INSERT statements for easy restoration
 */

import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Get filename from command line args or use default
const filename = process.argv[2] || `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
const backupDir = resolve(process.cwd(), '../backups');
const backupPath = resolve(backupDir, filename);

async function createBackup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Get all table names (excluding migrations and internal tables)
    const tablesResult = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT LIKE '%_journal'
      AND tablename NOT LIKE '%migrations%'
      ORDER BY tablename;
    `);

    const tables = tablesResult.rows.map((row) => row.tablename);
    console.log(`Found ${tables.length} tables to backup:`, tables);

    const statements: string[] = [];
    statements.push(`-- Database Backup: ${new Date().toISOString()}`);
    statements.push(`-- Database: ${process.env.DATABASE_URL?.split('@')[1] || 'unknown'}`);
    statements.push('');
    statements.push('BEGIN;');
    statements.push('-- Disable foreign key checks for faster import');
    statements.push('SET CONSTRAINTS ALL DEFERRED;');
    statements.push('');

    // Backup each table
    for (const table of tables) {
      console.log(`Backing up table: ${table}`);
      statements.push(`-- Table: ${table}`);

      // Get all rows from the table
      const { rows } = await client.query(`SELECT * FROM "public"."${table}"`);

      if (rows.length === 0) {
        statements.push(`-- Table ${table} is empty`);
        statements.push('');
        continue;
      }

      statements.push(`-- ${rows.length} rows`);
      statements.push(`TRUNCATE TABLE "public"."${table}" CASCADE;`);

      // Generate INSERT statements
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((col) => escapeValue(row[col]));

        const columnsStr = columns.map((c) => `"${c}"`).join(', ');
        const valuesStr = values.join(', ');

        statements.push(`INSERT INTO "public"."${table}" (${columnsStr}) VALUES (${valuesStr});`);
      }

      statements.push('');
    }

    statements.push('COMMIT;');
    statements.push('-- Backup completed successfully');

    const backupContent = statements.join('\n');

    // Ensure backup directory exists
    const { mkdir } = await import('fs/promises');
    try {
      await mkdir(backupDir, { recursive: true });
    } catch {
      // Directory already exists
    }

    writeFileSync(backupPath, backupContent, 'utf-8');
    console.log(`\n✅ Backup created: ${backupPath}`);
    console.log(`   File size: ${(backupContent.length / 1024).toFixed(2)} KB`);
  } finally {
    await client.end();
  }
}

/**
 * Escapes a value for SQL INSERT statement
 */
function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (typeof value === 'string') {
    // Escape single quotes by doubling them
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  if (typeof value === 'object') {
    // Handle JSON objects
    const jsonStr = JSON.stringify(value);
    const escaped = jsonStr.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  return `'${String(value)}'`;
}

// Run the backup
createBackup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
