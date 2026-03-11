import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../health.js";

describe("Health Routes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify();
    await fastify.register(healthRoutes);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it("GET /health returns 200 status", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
  });

  it("GET /health returns ok status", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/health",
    });

    const payload = JSON.parse(response.payload);
    expect(payload).toEqual({
      status: "ok",
      service: "branchforge-backend",
      timestamp: expect.any(String),
    });
  });

  it("GET /health returns valid ISO timestamp", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/health",
    });

    const payload = JSON.parse(response.payload);
    const date = new Date(payload.timestamp);
    expect(date.toISOString()).toBe(payload.timestamp);
  });
});
