/**
 * Integration test setup
 *
 * This file runs before all integration tests.
 */

import { beforeAll, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

beforeAll(async () => {
  // Set up test database connection
  const testDbUrl = process.env.DATABASE_URL_TEST;
  if (!testDbUrl) {
    console.warn('DATABASE_URL_TEST not set, skipping test database setup');
    return;
  }

  pool = new Pool({ connectionString: testDbUrl });

  // Verify connection
  try {
    await pool.query('SELECT 1');
    console.log('Test database connected successfully');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }
});

afterAll(async () => {
  if (pool) {
    await pool.end();
    console.log('Test database connection closed');
  }
});
