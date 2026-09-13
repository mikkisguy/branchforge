import type { FastifyInstance } from "fastify";
import { checkDatabaseReady } from "../db/index.js";

export async function healthRoutes(fastify: FastifyInstance) {
  // Liveness: process is up. Do not gate on the database.
  fastify.get("/health", async () => {
    return {
      status: "ok",
      service: "branchforge-backend",
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness: process can serve traffic that needs Postgres.
  fastify.get("/health/ready", async (_request, reply) => {
    const databaseReady = await checkDatabaseReady();
    if (!databaseReady) {
      return reply.status(503).send({
        status: "not_ready",
        service: "branchforge-backend",
        checks: {
          database: "error",
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ready",
      service: "branchforge-backend",
      checks: {
        database: "ok",
      },
      timestamp: new Date().toISOString(),
    };
  });
}
