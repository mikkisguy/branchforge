/**
 * Reset the test database by dropping all tables and types
 *
 * This is used when the migration tracking table gets out of sync
 * with the actual database schema (e.g., after manual schema changes).
 */

import pg from "pg";

const { Pool } = pg;

async function resetTestDatabase() {
  const connectionString = process.env.DATABASE_URL_TEST ?? "";
  if (!connectionString) {
    throw new Error("DATABASE_URL_TEST environment variable is required");
  }

  const pool = new Pool({ connectionString });

  try {
    const client = await pool.connect();

    try {
      console.log("Resetting TEST database...");

      // Drop all tables in the public schema
      await client.query(`
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;

        GRANT ALL ON SCHEMA public TO postgres;
        GRANT ALL ON SCHEMA public TO public;
        COMMENT ON SCHEMA public IS 'standard public schema';
      `);

      // Also drop drizzle schema
      await client.query(`
        DROP SCHEMA IF EXISTS drizzle CASCADE;
      `);

      console.log("✅ Test database reset successfully");

      await client.release();
      await pool.end();
      process.exit(0);
    } catch (err) {
      await client.release();
      throw err;
    }
  } catch (error) {
    console.error("❌ Reset failed:", error);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

resetTestDatabase();
