/**
 * Database connection singleton
 *
 * This module exports the database connection instance.
 * In test environment, it uses a separate database.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    let connectionString: string;

    if (process.env.NODE_ENV === 'test') {
      // In test environment, use DATABASE_URL_TEST
      const testUrl = process.env.DATABASE_URL_TEST;
      if (!testUrl) {
        throw new Error('DATABASE_URL_TEST environment variable is required in test environment');
      }
      connectionString = testUrl;
    } else {
      // In development/production, use DATABASE_URL
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error('DATABASE_URL environment variable is required');
      }
      connectionString = url;
    }

    const pool = new Pool({
      connectionString,
      max: 20,
    });

    db = drizzle(pool, { schema });
  }

  return db;
}

// For test cleanup
export async function closeDb() {
  if (db) {
    // Pool will be closed when the process exits
    db = null;
  }
}
