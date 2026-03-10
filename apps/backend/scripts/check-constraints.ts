import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../dist-schema/db/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const query = postgres(connectionString);
const db = drizzle(query);

async function verifyTableAccess() {
  try {
    console.log("Checking project_users constraints...");
    const projectUsers = await db.select().from(schema.projectUsers).limit(1);
    console.log("Project users sample:", projectUsers);

    console.log("\nChecking route_configs constraints...");
    const routeConfigs = await db.select().from(schema.routeConfigs).limit(1);
    console.log("Route configs sample:", routeConfigs);
  } finally {
    await query.end();
  }
}

verifyTableAccess().catch(console.error);

