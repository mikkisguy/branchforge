import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
  MIGRATION_LOCK_KEY,
  acquireMigrationLock,
  getMigrationConfig,
  runMigrations,
  type MigrationConfig,
  type MigrationConnection,
  type MigrationDependencies,
  type MigrationPool,
} from "../migration-runner.js";

function createConfig(
  overrides: Partial<MigrationConfig> = {}
): MigrationConfig {
  return {
    connectionString: "postgresql://user:secret@database/branchforge",
    databaseLabel: "MAIN",
    lockTimeoutMs: 1_000,
    migrationsFolder: "/app/dist/db/migrations",
    ...overrides,
  };
}

function createRuntime(queryResults: boolean[]) {
  const query = vi.fn(async (text: string) => {
    if (text.includes("pg_try_advisory_lock")) {
      return { rows: [{ acquired: queryResults.shift() ?? false }] };
    }
    return { rows: [{ pg_advisory_unlock: true }] };
  });
  const migrate = vi.fn(async () => {});
  const release = vi.fn();
  const end = vi.fn(async () => {});
  const connection: MigrationConnection = { query, migrate, release };
  const pool: MigrationPool = {
    connect: vi.fn(async () => connection),
    end,
  };
  let currentTime = 0;
  const dependencies: MigrationDependencies = {
    createPool: vi.fn(() => pool),
    now: () => currentTime,
    sleep: vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    }),
  };

  return { connection, dependencies, end, migrate, query, release };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getMigrationConfig", () => {
  it("uses the main database and default lock timeout", () => {
    const config = getMigrationConfig(
      { DATABASE_URL: "postgresql://main" },
      "/migrations"
    );

    expect(config).toEqual({
      connectionString: "postgresql://main",
      databaseLabel: "MAIN",
      lockTimeoutMs: DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
      migrationsFolder: "/migrations",
    });
  });

  it("uses the test database when NODE_ENV is test", () => {
    const config = getMigrationConfig(
      {
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://main",
        DATABASE_URL_TEST: "postgresql://test",
        DB_MIGRATION_LOCK_TIMEOUT_MS: "5000",
      },
      "/migrations"
    );

    expect(config.connectionString).toBe("postgresql://test");
    expect(config.databaseLabel).toBe("TEST");
    expect(config.lockTimeoutMs).toBe(5_000);
  });

  it("rejects missing database URLs and invalid lock timeouts", () => {
    expect(() => getMigrationConfig({}, "/migrations")).toThrow(
      "DATABASE_URL environment variable is required"
    );
    expect(() =>
      getMigrationConfig(
        {
          DATABASE_URL: "postgresql://main",
          DB_MIGRATION_LOCK_TIMEOUT_MS: "0",
        },
        "/migrations"
      )
    ).toThrow("DB_MIGRATION_LOCK_TIMEOUT_MS must be a positive integer");
  });
});

describe("acquireMigrationLock", () => {
  it("retries until the advisory lock is available", async () => {
    const runtime = createRuntime([false, true]);

    await expect(
      acquireMigrationLock(runtime.connection, 1_000, runtime.dependencies)
    ).resolves.toBe(true);
    expect(runtime.query).toHaveBeenCalledTimes(2);
    expect(runtime.query).toHaveBeenLastCalledWith(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [MIGRATION_LOCK_KEY]
    );
  });

  it("stops retrying at the configured timeout", async () => {
    const runtime = createRuntime([false, false, false]);

    await expect(
      acquireMigrationLock(runtime.connection, 300, runtime.dependencies)
    ).resolves.toBe(false);
    expect(runtime.dependencies.sleep).toHaveBeenCalledTimes(2);
  });
});

describe("runMigrations", () => {
  it("runs migrations under the lock and cleans up", async () => {
    const runtime = createRuntime([true]);

    await runMigrations(createConfig(), runtime.dependencies);

    expect(runtime.migrate).toHaveBeenCalledWith("/app/dist/db/migrations");
    expect(runtime.query).toHaveBeenLastCalledWith(
      "SELECT pg_advisory_unlock($1)",
      [MIGRATION_LOCK_KEY]
    );
    expect(runtime.release).toHaveBeenCalledOnce();
    expect(runtime.end).toHaveBeenCalledOnce();
  });

  it("releases the lock and connection when a migration fails", async () => {
    const runtime = createRuntime([true]);
    vi.mocked(runtime.migrate).mockRejectedValueOnce(new Error("broken SQL"));

    await expect(
      runMigrations(createConfig(), runtime.dependencies)
    ).rejects.toThrow("broken SQL");
    expect(runtime.query).toHaveBeenLastCalledWith(
      "SELECT pg_advisory_unlock($1)",
      [MIGRATION_LOCK_KEY]
    );
    expect(runtime.release).toHaveBeenCalledOnce();
    expect(runtime.end).toHaveBeenCalledOnce();
  });

  it("preserves the migration error when pool cleanup also fails", async () => {
    const runtime = createRuntime([true]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(runtime.migrate).mockRejectedValueOnce(new Error("broken SQL"));
    runtime.end.mockRejectedValueOnce(new Error("pool close failed"));

    await expect(
      runMigrations(createConfig(), runtime.dependencies)
    ).rejects.toThrow("broken SQL");
    expect(console.warn).toHaveBeenCalledWith(
      "Could not close the migration database pool",
      "pool close failed"
    );
  });

  it("reports a cleanup error after a successful migration", async () => {
    const runtime = createRuntime([true]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    runtime.end.mockRejectedValueOnce(new Error("pool close failed"));

    await expect(
      runMigrations(createConfig(), runtime.dependencies)
    ).rejects.toThrow("pool close failed");
  });

  it("does not migrate and still cleans up after a lock timeout", async () => {
    const runtime = createRuntime([false]);

    await expect(
      runMigrations(createConfig({ lockTimeoutMs: 1 }), runtime.dependencies)
    ).rejects.toThrow("Timed out after 1ms");
    expect(runtime.migrate).not.toHaveBeenCalled();
    expect(runtime.release).toHaveBeenCalledOnce();
    expect(runtime.end).toHaveBeenCalledOnce();
  });
});
