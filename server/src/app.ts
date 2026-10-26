import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
          },
    // Render terminates TLS and forwards requests through its proxy.
    trustProxy: true,
  });

  await app.register(healthRoutes);

  return app;
}
