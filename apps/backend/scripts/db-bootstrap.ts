/**
 * Bootstrap local/dev databases for a fresh Postgres instance.
 *
 * Ensures DATABASE_URL and DATABASE_URL_TEST databases exist, then runs
 * migrations on both. Safe to re-run.
 *
 * Usage: pnpm db:bootstrap
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const { Client, Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsFolder = resolve(__dirname, "../src/db/migrations");

function requireEnv(name: "DATABASE_URL" | "DATABASE_URL_TEST"): string {
  const value = process.env[name] ?? "";
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function databaseNameFromUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName) {
    throw new Error(
      `Connection string is missing a database name: ${url.host}`
    );
  }
  return dbName;
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function adminConnectionString(
  connectionString: string,
  maintenanceDb: string
): string {
  const url = new URL(connectionString);
  url.pathname = `/${maintenanceDb}`;
  return url.toString();
}

async function databaseExists(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "3D000") {
      // invalid_catalog_name — database does not exist
      return false;
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function createDatabase(connectionString: string, dbName: string) {
  const maintenanceDbs = ["postgres", "template1"];
  let lastError: unknown;

  for (const maintenanceDb of maintenanceDbs) {
    const client = new Client({
      connectionString: adminConnectionString(connectionString, maintenanceDb),
    });

    try {
      await client.connect();
      const existing = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName]
      );

      if ((existing.rowCount ?? 0) > 0) {
        console.log(`✓ Database "${dbName}" already exists`);
        return;
      }

      // CREATE DATABASE cannot use query parameters for the identifier.
      await client.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      console.log(`✓ Created database "${dbName}"`);
      return;
    } catch (error) {
      lastError = error;
    } finally {
      await client.end().catch(() => {});
    }
  }

  throw new Error(
    `Failed to create database "${dbName}". Ensure the Postgres role can connect to postgres/template1 and has CREATEDB. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function ensureDatabase(label: string, connectionString: string) {
  const dbName = databaseNameFromUrl(connectionString);
  console.log(`Checking ${label} database "${dbName}"...`);

  if (await databaseExists(connectionString)) {
    console.log(`✓ Database "${dbName}" already exists`);
    return;
  }

  console.log(`Database "${dbName}" is missing; creating...`);
  await createDatabase(connectionString, dbName);
}

async function runMigrations(label: string, connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 1,
  });

  try {
    const db = drizzle(pool, { logger: false });
    console.log(`Running migrations on ${label} database...`);
    await migrate(db, { migrationsFolder });
    console.log(`✓ Migrations completed on ${label}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function bootstrap() {
  const mainUrl = requireEnv("DATABASE_URL");
  const testUrl = requireEnv("DATABASE_URL_TEST");

  console.log("Bootstrapping BranchForge databases...\n");

  await ensureDatabase("MAIN", mainUrl);
  await ensureDatabase("TEST", testUrl);

  console.log(`\nMigrations folder: ${migrationsFolder}\n`);

  await runMigrations("MAIN", mainUrl);
  await runMigrations("TEST", testUrl);

  console.log("\n✅ Database bootstrap completed successfully");
}

bootstrap().catch((error) => {
  console.error("❌ Database bootstrap failed:", error);
  process.exit(1);
});
