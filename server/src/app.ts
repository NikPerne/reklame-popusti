import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { RefreshTrigger, type RefreshSummary } from './jobs/refresh-runner.js';
import type { Logger } from './lib/logger.js';
import { authPlugin } from './plugins/auth.js';
import { clientAppPlugin } from './plugins/client-app.js';
import type { OfferRepository } from './repositories/offer-repository.js';
import type { ShoppingListRepository } from './repositories/shopping-list-repository.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { offerRoutes } from './routes/offers.js';
import { shoppingListRoutes } from './routes/shopping-list.js';

export interface AppDependencies {
  env: Env;
  repository: OfferRepository;
  shoppingList: ShoppingListRepository;
  /** Runs one refresh of all stores; started by POST /api/admin/refresh. */
  refresh: (log: Logger) => Promise<RefreshSummary>;
  /** Directory of the built Angular app to serve; omitted in development and API-only tests. */
  clientRoot?: string;
}

/** CSP for the Angular app: no inline scripts; inline styles are needed for component styles. */
const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  // Product images are hotlinked from the stores' websites.
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: ["'self'"],
  fontSrc: ["'self'"],
  manifestSrc: ["'self'"],
  workerSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

export async function buildApp({
  env,
  repository,
  shoppingList,
  refresh,
  clientRoot,
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
    // X-Forwarded-Proto from that proxy also tells Fastify the request was HTTPS.
    trustProxy: (_address, hop) => hop < env.TRUST_PROXY_HOPS,
  });

  await app.register(fastifySensible);
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        ...CONTENT_SECURITY_POLICY,
        // Would break a production build served over plain http://localhost.
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('x-robots-tag', 'noindex, nofollow');
  });
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
  await app.register(shoppingListRoutes, { shoppingList });
  await app.register(adminRoutes, {
    refreshTrigger: new RefreshTrigger(() => refresh(app.log), app.log),
  });
  if (clientRoot) {
    await app.register(clientAppPlugin, { root: clientRoot });
  }

  return app;
}
