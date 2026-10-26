import { timingSafeEqual } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.js';
import type { SessionUser } from '../domain/account.js';

export const SESSION_COOKIE = 'session';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * How the route is protected. Default (undefined) is `session`: a valid session cookie.
     * `public` routes are open; `refresh-token` routes need the X-Refresh-Token header.
     */
    auth?: 'public' | 'refresh-token';
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

function hasValidRefreshToken(request: FastifyRequest, expected: string): boolean {
  const provided = request.headers['x-refresh-token'];
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Default-deny authentication for every route under /api, including unknown ones.
 * Routes opt out with `config.auth`.
 */
export const authPlugin = fp(
  async (
    app: FastifyInstance,
    env: Pick<Env, 'JWT_SECRET' | 'SESSION_TTL_HOURS' | 'REFRESH_TOKEN'>,
  ) => {
    await app.register(fastifyCookie);
    await app.register(fastifyJwt, {
      secret: env.JWT_SECRET,
      cookie: { cookieName: SESSION_COOKIE, signed: false },
      sign: { expiresIn: `${env.SESSION_TTL_HOURS}h` },
    });

    app.addHook('onRequest', async (request, reply) => {
      // The web app's own files (HTML, JS, icons) are public: the login page has to load.
      if (request.url !== '/api' && !request.url.startsWith('/api/')) return;
      const auth = request.routeOptions.config.auth;
      if (auth === 'public') return;
      if (auth === 'refresh-token') {
        if (!hasValidRefreshToken(request, env.REFRESH_TOKEN)) {
          return reply.unauthorized('Invalid refresh token');
        }
        return;
      }
      try {
        const user = await request.jwtVerify<Partial<SessionUser>>();
        // Sessions from before accounts existed have no email; they must log in again.
        if (typeof user.sub !== 'string' || typeof user.email !== 'string') throw new Error();
      } catch {
        return reply.unauthorized('Not logged in');
      }
    });
  },
  { name: 'auth' },
);
