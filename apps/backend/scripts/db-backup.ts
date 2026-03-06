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
    statements.push('-- Disable all triggers and FK checks during restore');
    statements.push('SET session_replication_role = \'replica\';');
    statements.push('');
    statements.push('-- Truncate all tables first (to handle foreign key constraints)');

    // First, add TRUNCATE statements for ALL tables
    for (const table of tables) {
      statements.push(`TRUNCATE TABLE "public"."${table}" CASCADE;`);
    }
    statements.push('');

    // Store table data to insert later
    const tableData: Array<{ table: string; rows: unknown[]; jsonbColumns: Set<string> }> = [];

    // Collect data from all tables
    for (const table of tables) {
      console.log(`Backing up table: ${table}`);

      // Get column types for this table (to handle jsonb columns correctly)
      const columnTypesResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      const jsonbColumns = new Set(
        columnTypesResult.rows
          .filter((row) => row.data_type === 'jsonb' || row.data_type === 'json')
          .map((row) => row.column_name)
      );

      // Get all rows from the table
      const { rows } = await client.query(`SELECT * FROM "public"."${table}"`);

      if (rows.length === 0) {
        console.log(`   Table ${table} is empty`);
        continue;
      }

      console.log(`   Table ${table}: ${rows.length} rows`);
      tableData.push({ table, rows, jsonbColumns });
    }

    // Generate INSERT statements for all tables with data
    for (const { table, rows, jsonbColumns } of tableData) {
      statements.push(`-- Table: ${table} (${rows.length} row${rows.length === 1 ? '' : 's'})`);

      // Generate INSERT statements
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((col) => escapeValue(row[col], jsonbColumns.has(col)));

        const columnsStr = columns.map((c) => `"${c}"`).join(', ');
        const valuesStr = values.join(', ');

        statements.push(`INSERT INTO "public"."${table}" (${columnsStr}) VALUES (${valuesStr});`);
      }

      statements.push('');
    }

    // Re-enable foreign key checks before committing
    statements.push('-- Re-enable foreign key checks');
    statements.push('SET session_replication_role = \'origin\';');
    statements.push('');

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
 * @param value - The value to escape
 * @param isJsonbColumn - Whether this value is from a jsonb/json column
 */
function escapeValue(value: unknown, isJsonbColumn = false): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  // JSONB columns always need stringified JSON
  if (isJsonbColumn) {
    const jsonStr = typeof value === 'object' || typeof value === 'boolean'
      ? JSON.stringify(value)
      : String(value);
    const escaped = jsonStr.replace(/'/g, "''");
    return `'${escaped}'`;
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
