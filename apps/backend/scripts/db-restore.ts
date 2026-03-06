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

/**
 * Splits SQL content into individual statements, handling:
 * - Single-quoted strings (can contain semicolons)
 * - Double-quoted strings (can contain semicolons)
 * - Comments (-- style)
 * - Dollar-quoted strings ($$...$$)
 */
function splitSqlStatements(content: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarQuoteTag = '';
  let dollarQuoteStart = -1;
  let inLineComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';

    // Handle line comments
    if (!inSingleQuote && !inDoubleQuote && !inDollarQuote && char === '-' && nextChar === '-') {
      inLineComment = true;
    }

    // End of line comment
    if (inLineComment && (char === '\n' || char === '\r')) {
      inLineComment = false;
      if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
        statements.push(currentStatement.trim());
      }
      currentStatement = '';
      continue;
    }

    if (inLineComment) {
      continue;
    }

    // Handle dollar-quoted strings
    if (!inSingleQuote && !inDoubleQuote && char === '$' && !inDollarQuote) {
      // Check if this starts a dollar-quoted string
      let tagEnd = i + 1;
      while (tagEnd < content.length && content[tagEnd] !== '$') {
        tagEnd++;
      }
      if (content[tagEnd] === '$') {
        inDollarQuote = true;
        dollarQuoteTag = content.substring(i, tagEnd + 1);
        dollarQuoteStart = i;
        currentStatement += char;
        continue;
      }
    }

    if (inDollarQuote && char === '$') {
      // Check if this ends the dollar-quoted string
      const possibleEnd = i - dollarQuoteTag.length + 1;
      if (possibleEnd >= 0 && content.substring(possibleEnd, i + 1) === dollarQuoteTag) {
        inDollarQuote = false;
        dollarQuoteTag = '';
        currentStatement += char;
        continue;
      }
    }

    // Skip special character handling when inside quotes
    if (inDollarQuote) {
      currentStatement += char;
      continue;
    }

    // Handle single quotes
    if (!inDoubleQuote && char === "'") {
      // Check for escaped single quote ('')
      if (nextChar === "'") {
        currentStatement += "''";
        i++; // Skip next quote
        continue;
      }
      inSingleQuote = !inSingleQuote;
      currentStatement += char;
      continue;
    }

    // Handle double quotes
    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      currentStatement += char;
      continue;
    }

    // Inside string literals, just add the character
    if (inSingleQuote || inDoubleQuote) {
      currentStatement += char;
      continue;
    }

    // Outside quotes, check for statement terminator
    if (char === ';') {
      currentStatement += char;
      const trimmed = currentStatement.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      currentStatement = '';
      continue;
    }

    // Regular character
    currentStatement += char;
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    const trimmed = currentStatement.trim();
    if (trimmed && !trimmed.startsWith('--')) {
      statements.push(trimmed);
    }
  }

  return statements;
}

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

    // Show which database we're connected to
    const dbInfo = await client.query('SELECT current_database(), current_user, inet_server_addr(), inet_server_port();');
    console.log(`   Database: ${dbInfo.rows[0].current_database}`);
    console.log(`   User: ${dbInfo.rows[0].current_user}`);
    console.log(`   Server: ${dbInfo.rows[0].inet_server_addr}:${dbInfo.rows[0].inet_server_port}`);

    // Parse SQL into individual statements, handling semicolons in strings
    const statements = splitSqlStatements(content);

    console.log(`⏳ Executing ${statements.length} statements...`);

    // Debug: Show first few statements
    console.log('\n📋 First 5 parsed statements:');
    for (let i = 0; i < Math.min(5, statements.length); i++) {
      console.log(`   ${i + 1}. ${statements[i]?.substring(0, 80)}...`);
    }

    // Execute each statement
    // Note: The backup file already contains BEGIN/COMMIT, so we don't wrap it
    let executedCount = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt && !stmt.startsWith('--')) {
        const stmtType = stmt.split(' ')[0]?.toUpperCase();
        try {
          const result = await client.query(stmt);
          executedCount++;

          // Log every statement with details
          console.log(`   [${executedCount}/${statements.length}] ${stmtType}`);
          if (result.rowCount !== null) {
            console.log(`      → ${result.rowCount} rows affected`);
          }
        } catch (err) {
          console.error(`   ❌ Error executing statement ${i + 1}: ${stmtType}`);
          console.error(`      ${stmt.substring(0, 200)}...`);
          throw err;
        }
      }
    }

    console.log('\n✅ Restore completed successfully!');
    console.log(`   Restored from: ${backupPath}`);
    console.log(`   Executed ${executedCount} statements`);

    // Verify the data was actually restored
    console.log('\n📊 Verifying restored data:');
    const verification = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM admin_settings) as admin_settings,
        (SELECT COUNT(*) FROM gitlab_integrations) as gitlab_integrations,
        (SELECT COUNT(*) FROM user_sessions) as user_sessions,
        (SELECT COUNT(*) FROM users) as users;
    `);
    console.log(`   admin_settings: ${verification.rows[0].admin_settings} rows`);
    console.log(`   gitlab_integrations: ${verification.rows[0].gitlab_integrations} rows`);
    console.log(`   user_sessions: ${verification.rows[0].user_sessions} rows`);
    console.log(`   users: ${verification.rows[0].users} rows`);
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
