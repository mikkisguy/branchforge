import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.routes.js';

const server = Fastify({
  logger: true,
});

// Plugins
await server.register(cors, {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
});

await server.register(cookie);
await server.register(session, {
  secret: process.env.SESSION_SECRET ?? 'dev-secret-please-change-in-production',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000, // 24 hours
  },
});

// Routes
const basePath = process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/api/' : '/api/api/');
await server.register(healthRoutes, { prefix: basePath });
await server.register(authRoutes, { prefix: basePath });

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT ?? '3000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
