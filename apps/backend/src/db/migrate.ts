import { runMigrations } from "./migration-runner.js";

runMigrations().catch((error) => {
  console.error(
    "Database migration failed:",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
