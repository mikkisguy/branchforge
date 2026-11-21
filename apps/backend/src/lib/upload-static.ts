import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { UPLOADS_DIR } from "./storage.js";

export async function registerUploadStatic(
  server: FastifyInstance,
  basePath: string,
  root: string
): Promise<void> {
  await server.register(fastifyStatic, {
    root,
    prefix: `${basePath}${UPLOADS_DIR}/`,
    decorateReply: false,
    setHeaders: (reply) => {
      // Prevent MIME sniffing and cross-origin use of user-uploaded files.
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Cross-Origin-Resource-Policy", "same-origin");
      // Cache images for one hour.
      reply.header("Cache-Control", "public, max-age=3600");
    },
  });
}
