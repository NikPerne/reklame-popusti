import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { RefreshTrigger, type RefreshSummary } from './jobs/refresh-runner.js';
import type { Logger } from './lib/logger.js';
import { authPlugin } from './plugins/auth.js';
import type { OfferRepository } from './repositories/offer-repository.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { offerRoutes } from './routes/offers.js';

export interface AppDependencies {
  env: Env;
  repository: OfferRepository;
  /** Runs one refresh of all stores; started by POST /api/admin/refresh. */
  refresh: (log: Logger) => Promise<RefreshSummary>;
}

export async function buildApp({
  env,
  repository,
  refresh,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ['req.headers.cookie', 'req.headers["x-refresh-token"]'],
            ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
          },
    // Trust only the nearest TRUST_PROXY_HOPS proxies (Render's), so X-Forwarded-For can't be spoofed.
    trustProxy: (_address, hop) => hop < env.TRUST_PROXY_HOPS,
  });

  await app.register(fastifySensible);
  await app.register(fastifyRateLimit, { global: false });
  await app.register(authPlugin, env);

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(statusCode).send({ statusCode, error: 'Internal Server Error' });
    }
    const message = error instanceof Error ? error.message : 'Bad Request';
    return reply.code(statusCode).send({ statusCode, error: message });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, env);
  await app.register(offerRoutes, { repository });
  await app.register(adminRoutes, {
    refreshTrigger: new RefreshTrigger(() => refresh(app.log), app.log),
  });

  return app;
}
