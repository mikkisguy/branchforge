import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.routes.js";
import { adminSettingsRoutes } from "./routes/admin-settings.routes.js";
import {
  userSettingsRoutes,
  userSettingsAvatarRoutes,
} from "./routes/user-settings.routes.js";
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
import { flowRoutes } from "./routes/flow.routes.js";
import { exportsRoutes } from "./routes/exports.routes.js";
import { visualSystemsRoutes } from "./routes/visual-systems.routes.js";
import { worldElementsRoutes } from "./routes/world-elements.routes.js";
import { pairGroupsRoutes } from "./routes/pair-groups.routes.js";
import { createDrizzleSessionStore } from "./services/session-store.service.js";
import { setupShutdownHandlers } from "./lib/shutdown.js";
import { cleanupStaleSyncOperations } from "./services/gitlab-sync.service.js";
import { globalErrorHandler } from "./middleware/error-handler.middleware.js";
import { validateCsrfToken } from "./middleware/csrf.middleware.js";
import { SESSION_COOKIE_NAME } from "./lib/session.js";
import { getBasePath, getSessionMaxAge } from "./lib/config.js";
import {
  ensureAvatarDir,
  UPLOADS_DIR,
  getUploadsDirPath,
} from "./lib/storage.js";

// Fastify instance with explicit body limit for JSON/text bodies.
// Note: multipart plugin has its own `fileSize` limit that overrides per-part.
const server = Fastify({
  logger: true,
  bodyLimit: 5 * 1024 * 1024, // 5 MB; align with multipart limits
  // Trust only loopback addresses when reading X-Forwarded-For.
  // This makes `request.ip` return the real client IP behind a single
  // reverse proxy on the same host, while preventing clients from
  // spoofing their IP via headers when no trusted proxy is present.
  // Operators deploying behind multiple proxy hops should override
  // this via the TRUST_PROXY environment variable or Fastify config.
  trustProxy: "loopback",
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

// Require an explicit SESSION_SECRET in production. The hardcoded fallback
// would otherwise make sessions forgeable to anyone with source access.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.SESSION_SECRET?.trim()
) {
  throw new Error(
    "SESSION_SECRET environment variable must be set in production"
  );
}

// Require an explicit ENCRYPTION_KEY in production. It protects GitLab
// PATs at rest (AES-256-GCM); without it the app fails at first encrypt
// anyway, so we fail fast at boot for a clearer signal and to avoid
// silently shipping unencryptable integrations.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.ENCRYPTION_KEY?.trim()
) {
  throw new Error(
    "ENCRYPTION_KEY environment variable must be set in production"
  );
}

await server.register(session, {
  secret:
    process.env.SESSION_SECRET ?? "dev-secret-please-change-in-production",
  cookieName: SESSION_COOKIE_NAME,
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    // Configurable absolute session lifetime (1h–30d, default 24h) via
    // SESSION_MAX_AGE. Sliding expiry (rolling, below) makes this act as
    // an inactivity timeout rather than a fixed-from-login cap.
    maxAge: getSessionMaxAge(),
    // Add additional security headers for production
    path: basePath,
  },
  // Save session on every request to ensure session data is up-to-date
  saveUninitialized: false,
  // Slide session expiry on activity: with rolling enabled, @fastify/session
  // calls store.set on each response, and setSession refreshes expiresAt to
  // now + maxAge — so maxAge acts as an inactivity timeout rather than a
  // fixed-from-login cap.
  rolling: true,
});

// Routes
await server.register(healthRoutes, { prefix: basePath });
await server.register(authRoutes, { prefix: basePath });
await server.register(adminSettingsRoutes, { prefix: basePath });
await server.register(userSettingsRoutes, { prefix: basePath });
await server.register(userSettingsAvatarRoutes, { prefix: basePath });
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
await server.register(flowRoutes, { prefix: basePath });
await server.register(exportsRoutes, { prefix: basePath });
await server.register(visualSystemsRoutes, { prefix: basePath });
await server.register(worldElementsRoutes, { prefix: basePath });
await server.register(pairGroupsRoutes, { prefix: basePath });

// Register a global preValidation hook that enforces double-submit
// CSRF protection on every state-changing request. The hook itself
// is a no-op for safe methods, exempt content types, and the login
// / register routes, so it is safe to install globally.
// See GitHub issue #206.
server.addHook("preValidation", validateCsrfToken);

// Start server
const start = async () => {
  try {
    // Register global error handler before listening
    server.setErrorHandler(globalErrorHandler);

    // Cleanup any sync operations left IN_PROGRESS from a previous crash
    await cleanupStaleSyncOperations();

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
