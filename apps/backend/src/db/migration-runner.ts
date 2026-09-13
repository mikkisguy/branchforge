/**
 * Production-safe database migration runner.
 *
 * The runner uses a session-level PostgreSQL advisory lock so that only one
 * release job can apply Drizzle migrations at a time.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 60_000;
export const MIGRATION_LOCK_KEY = 0x42524647;
const LOCK_RETRY_INTERVAL_MS = 250;

export interface MigrationConfig {
  connectionString: string;
  databaseLabel: "MAIN" | "TEST";
  lockTimeoutMs: number;
  migrationsFolder: string;
}

export interface MigrationConnection {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  migrate(migrationsFolder: string): Promise<void>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationConnection>;
  end(): Promise<void>;
}

export interface MigrationDependencies {
  createPool(connectionString: string): MigrationPool;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

function defaultMigrationsFolder(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
}

function readPositiveInteger(
  value: string | undefined,
  name: string,
  fallback: number
): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe positive integer`);
  }

  return parsed;
}

export function getMigrationConfig(
  env: NodeJS.ProcessEnv = process.env,
  migrationsFolder = defaultMigrationsFolder()
): MigrationConfig {
  const isTest = env.NODE_ENV === "test";
  const databaseVariable = isTest ? "DATABASE_URL_TEST" : "DATABASE_URL";
  const connectionString = env[databaseVariable];

  if (!connectionString) {
    throw new Error(`${databaseVariable} environment variable is required`);
  }

  return {
    connectionString,
    databaseLabel: isTest ? "TEST" : "MAIN",
    lockTimeoutMs: readPositiveInteger(
      env.DB_MIGRATION_LOCK_TIMEOUT_MS,
      "DB_MIGRATION_LOCK_TIMEOUT_MS",
      DEFAULT_MIGRATION_LOCK_TIMEOUT_MS
    ),
    migrationsFolder,
  };
}

function createNodePgPool(connectionString: string): MigrationPool {
  const pool = new Pool({
    connectionString,
    max: 1,
  });

  return {
    async connect() {
      const client = await pool.connect();
      const db = drizzle(client, { logger: false });

      return {
        async query(text, values) {
          const result = await client.query(
            text,
            values === undefined ? undefined : [...values]
          );
          return { rows: result.rows };
        },
        async migrate(migrationsFolder) {
          await migrate(db, { migrationsFolder });
        },
        release() {
          client.release();
        },
      };
    },
    async end() {
      await pool.end();
    },
  };
}

const defaultDependencies: MigrationDependencies = {
  createPool: createNodePgPool,
  now: Date.now,
  sleep: async (milliseconds) => {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, milliseconds)
    );
  },
};

export async function acquireMigrationLock(
  connection: Pick<MigrationConnection, "query">,
  timeoutMs: number,
  dependencies: Pick<MigrationDependencies, "now" | "sleep">
): Promise<boolean> {
  const deadline = dependencies.now() + timeoutMs;

  do {
    const result = await connection.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [MIGRATION_LOCK_KEY]
    );

    if (result.rows[0]?.acquired === true) {
      return true;
    }

    const remainingMs = deadline - dependencies.now();
    if (remainingMs <= 0) {
      return false;
    }

    await dependencies.sleep(Math.min(LOCK_RETRY_INTERVAL_MS, remainingMs));
  } while (dependencies.now() <= deadline);

  return false;
}

export async function runMigrations(
  config = getMigrationConfig(),
  dependencies: MigrationDependencies = defaultDependencies
): Promise<void> {
  const pool = dependencies.createPool(config.connectionString);
  let connection: MigrationConnection | undefined;
  let lockAcquired = false;
  let operationFailed = false;
  let operationError: unknown;

  try {
    connection = await pool.connect();
    console.log(
      `Waiting for ${config.databaseLabel} database migration lock...`
    );

    lockAcquired = await acquireMigrationLock(
      connection,
      config.lockTimeoutMs,
      dependencies
    );

    if (!lockAcquired) {
      throw new Error(
        `Timed out after ${config.lockTimeoutMs}ms waiting for the database migration lock`
      );
    }

    console.log(
      `Running ${config.databaseLabel} database migrations from ${config.migrationsFolder}...`
    );
    await connection.migrate(config.migrationsFolder);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  let cleanupError: unknown;
  if (connection) {
    if (lockAcquired) {
      try {
        await connection.query("SELECT pg_advisory_unlock($1)", [
          MIGRATION_LOCK_KEY,
        ]);
      } catch (error) {
        console.warn(
          "Could not explicitly release the migration lock; closing the connection will release it",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    try {
      connection.release();
    } catch (error) {
      cleanupError = error;
      console.warn(
        "Could not release the migration database connection",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  try {
    await pool.end();
  } catch (error) {
    cleanupError ??= error;
    console.warn(
      "Could not close the migration database pool",
      error instanceof Error ? error.message : String(error)
    );
  }

  if (operationFailed) {
    throw operationError;
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }

  console.log("Database migrations completed successfully");
}
