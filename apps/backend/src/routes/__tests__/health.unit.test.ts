import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../health.js";

vi.mock("../../db/index.js", () => ({
  checkDatabaseReady: vi.fn(),
}));

import { checkDatabaseReady } from "../../db/index.js";

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

  it("GET /health/ready returns 200 when database is ready", async () => {
    vi.mocked(checkDatabaseReady).mockResolvedValueOnce(true);

    const response = await fastify.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({
      status: "ready",
      service: "branchforge-backend",
      checks: { database: "ok" },
      timestamp: expect.any(String),
    });
  });

  it("GET /health/ready returns 503 when database is down", async () => {
    vi.mocked(checkDatabaseReady).mockResolvedValueOnce(false);

    const response = await fastify.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toEqual({
      status: "not_ready",
      service: "branchforge-backend",
      checks: { database: "error" },
      timestamp: expect.any(String),
    });
  });
});
