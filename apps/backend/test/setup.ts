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

// Test fixtures
export const testFixtures = {
  users: {
    owner: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'owner@test.com',
      passwordHash: 'hashed_password',
      role: 'OWNER',
    },
    reader: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'reader@test.com',
      passwordHash: 'hashed_password',
      role: 'READER',
    },
  },

  projects: {
    prequel: {
      id: '10000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000001',
      name: 'Test Prequel',
      type: 'PREQUEL',
      description: 'A test prequel project',
      maxMeterDelta: 10,
      visibility: 'OWNER',
    },
    sequel: {
      id: '10000000-0000-0000-0000-000000000002',
      userId: '00000000-0000-0000-0000-000000000001',
      name: 'Test Sequel',
      type: 'SEQUEL',
      description: 'A test sequel project',
      maxMeterDelta: 10,
      visibility: 'OWNER',
    },
  },

  gitlab: {
    validToken: 'glpat-test123456789',
    invalidToken: 'invalid-token',
    projectId: 12345,
    projectName: 'test-repo',
    projectPath: 'user/test-repo',
    branch: 'main',
    encryptedToken: 'encrypted_glpat_test123456789',
  },

  rpy: {
    sampleFile: `# Declare characters used in this game
define s = Character("Sylvie", color="#c8ffc8")

default persistent._test_resume = False

# The game starts here
label start:
    "Hello, world!"

    s "Welcome to BranchForge!"

    jump chapter1

label chapter1:
    s "This is chapter 1."

    menu:
        "Choice 1":
            jump route_a
        "Choice 2":
            jump route_b

label route_a:
    s "You chose route A."
    return

label route_b:
    s "You chose route B."
    return
`,
    minimalFile: `label start:
    "Hello, world!"
    return
`,
  },
};

// Helper to generate test tokens
export function generateTestToken(userId: string, expiresIn = '1h'): string {
  return `test_token_${userId}`;
}
