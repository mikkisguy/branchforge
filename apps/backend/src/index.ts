import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.routes.js';
import { adminSettingsRoutes } from './routes/admin-settings.routes.js';
import { gitlabRoutes } from './routes/gitlab.routes.js';
import { projectsRoutes } from './routes/projects.routes.js';
import { scenesRoutes } from './routes/scenes.routes.js';
import { createDrizzleSessionStore } from './services/session-store.service.js';
import { setupShutdownHandlers } from './lib/shutdown.js';
import { globalErrorHandler } from './middleware/error-handler.middleware.js';

const server = Fastify({
  logger: true,
});

// Plugins
await server.register(cors, {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
});

await server.register(cookie);

// Create persistent session store
const sessionStore = createDrizzleSessionStore({
  // Clean up expired sessions every hour
  cleanupInterval: 60 * 60 * 1000,
});

await server.register(session, {
  secret: process.env.SESSION_SECRET ?? 'dev-secret-please-change-in-production',
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000, // 24 hours
    // Add additional security headers for production
    path: process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/api/' : '/api/api/'),
  },
  // Save session on every request to ensure session data is up-to-date
  saveUninitialized: false,
  rolling: false,
});

// Routes
const basePath = process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/api/' : '/api/api/');
await server.register(healthRoutes, { prefix: basePath });
await server.register(authRoutes, { prefix: basePath });
await server.register(adminSettingsRoutes, { prefix: basePath });
await server.register(gitlabRoutes, { prefix: basePath });
await server.register(projectsRoutes, { prefix: basePath });
await server.register(scenesRoutes, { prefix: basePath });

// Start server
const start = async () => {
  try {
    // Register global error handler before listening
    server.setErrorHandler(globalErrorHandler);

    const port = parseInt(process.env.PORT ?? '3000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);

    // Setup graceful shutdown handlers after server is ready
    setupShutdownHandlers(server, sessionStore);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
