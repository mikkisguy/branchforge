import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { registerUploadStatic } from "../upload-static.js";

it.each(["GET", "HEAD"] as const)(
  "serves uploads with security and cache headers on %s",
  async (method) => {
    const root = await mkdtemp(join(tmpdir(), "branchforge-uploads-"));
    const server = Fastify();
    try {
      await writeFile(join(root, "avatar.webp"), "fixture");
      await registerUploadStatic(server, "/studio/", root);

      const response = await server.inject({
        method,
        url: "/studio/uploads/avatar.webp",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers).toMatchObject({
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
        "cache-control": "public, max-age=3600",
      });
      expect(response.body).toBe(method === "GET" ? "fixture" : "");
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  }
);
