import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.routes.js";
import { adminSettingsRoutes } from "./routes/admin-settings.routes.js";
import { userSettingsRoutes } from "./routes/user-settings.routes.js";
import { gitlabRoutes } from "./routes/gitlab.routes.js";
import { projectsRoutes } from "./routes/projects.routes.js";
import { labelsRoutes } from "./routes/labels.routes.js";
import {
  charactersRoutes,
  characterAvatarRoutes,
} from "./routes/characters.routes.js";
import { routeConfigsRoutes } from "./routes/route-configs.routes.js";
import { variablesRoutes } from "./routes/variables.routes.js";
import { statsRoutes } from "./routes/stats.routes.js";
import { zipImportRoutes } from "./routes/zip-import.routes.js";
import { createDrizzleSessionStore } from "./services/session-store.service.js";
import { setupShutdownHandlers } from "./lib/shutdown.js";
import { globalErrorHandler } from "./middleware/error-handler.middleware.js";
import { SESSION_COOKIE_NAME } from "./lib/session.js";
import { getBasePath } from "./lib/config.js";
import {
  ensureAvatarDir,
  UPLOADS_DIR,
  getUploadsDirPath,
} from "./lib/storage.js";

const server = Fastify({
  logger: true,
});

// Plugins
await server.register(cors, {
  origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  credentials: true,
});

await server.register(cookie);

// Register multipart plugin for file uploads
await server.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1, // Max 1 file per request
  },
});

// Compute base path once and reuse throughout
const basePath = getBasePath();

// Ensure avatar directory exists on startup BEFORE registering static file serving
await ensureAvatarDir();

// Register static file serving for uploads (under base path for consistency)
await server.register(fastifyStatic, {
  root: getUploadsDirPath(),
  prefix: `${basePath}${UPLOADS_DIR}/`,
  decorateReply: false,
  // Security headers for user-uploaded content
  setHeaders: (res) => {
    // Prevent MIME-sniffing attacks
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Restrict cross-origin access to uploaded files
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    // Cache images for 1 hour (avatars don't change frequently)
    res.setHeader("Cache-Control", "public, max-age=3600");
  },
});

// Create persistent session store
const sessionStore = createDrizzleSessionStore({
  // Clean up expired sessions every hour
  cleanupInterval: 60 * 60 * 1000,
});

await server.register(session, {
  secret:
    process.env.SESSION_SECRET ?? "dev-secret-please-change-in-production",
  cookieName: SESSION_COOKIE_NAME,
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400000, // 24 hours
    // Add additional security headers for production
    path: basePath,
  },
  // Save session on every request to ensure session data is up-to-date
  saveUninitialized: false,
  rolling: false,
});

// Routes
await server.register(healthRoutes, { prefix: basePath });
await server.register(authRoutes, { prefix: basePath });
await server.register(adminSettingsRoutes, { prefix: basePath });
await server.register(userSettingsRoutes, { prefix: basePath });
await server.register(gitlabRoutes, { prefix: basePath });
await server.register(projectsRoutes, { prefix: basePath });
await server.register(labelsRoutes, { prefix: basePath });
await server.register(charactersRoutes, { prefix: basePath });
await server.register(characterAvatarRoutes, { prefix: basePath });
await server.register(routeConfigsRoutes, { prefix: basePath });
await server.register(variablesRoutes, { prefix: basePath });
await server.register(statsRoutes, { prefix: basePath });
// Register zip import routes after multipart plugin (for file uploads)
await server.register(zipImportRoutes, { prefix: basePath });

// Start server
const start = async () => {
  try {
    // Register global error handler before listening
    server.setErrorHandler(globalErrorHandler);

    const port = parseInt(process.env.PORT ?? "3000", 10);
    await server.listen({ port, host: "0.0.0.0" });
    server.log.info(`Server listening on port ${port}`);

    // Setup graceful shutdown handlers after server is ready
    setupShutdownHandlers(server, sessionStore);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
