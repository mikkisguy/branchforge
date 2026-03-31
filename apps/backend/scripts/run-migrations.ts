/**
 * Run database migrations using drizzle-orm migrator
 *
 * This script applies pending migrations to the database.
 * It supports both main and test databases via NODE_ENV.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const isTest = process.env.NODE_ENV === "test";

  // Determine which database to use
  let connectionString: string;
  if (isTest) {
    connectionString = process.env.DATABASE_URL_TEST ?? "";
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL_TEST environment variable is required when NODE_ENV=test"
      );
    }
  } else {
    connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
  }

  // Create connection pool
  const pool = new Pool({
    connectionString,
    max: 1, // Only need one connection for migrations
  });

  try {
    const db = drizzle(pool, { logger: true });

    // Resolve migrations folder (relative to this script)
    const migrationsFolder = resolve(__dirname, "../src/db/migrations");

    console.log(
      `Running migrations on ${isTest ? "TEST" : "MAIN"} database...`
    );
    console.log(`Migrations folder: ${migrationsFolder}`);

    // Run migrations
    await migrate(db, { migrationsFolder });

    console.log("✅ Migrations completed successfully");

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

runMigrations();
