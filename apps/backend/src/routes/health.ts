import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return {
      status: "ok",
      service: "branchforge-backend",
      timestamp: new Date().toISOString(),
    };
  });
}
