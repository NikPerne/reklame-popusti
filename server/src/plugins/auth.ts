import { timingSafeEqual } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.js';

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
    payload: { sub: 'owner' };
    user: { sub: 'owner' };
  }
}

function hasValidRefreshToken(request: FastifyRequest, expected: string): boolean {
  const provided = request.headers['x-refresh-token'];
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Default-deny authentication for every route. Routes opt out with `config.auth`. */
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
      const auth = request.routeOptions.config.auth;
      if (auth === 'public') return;
      if (auth === 'refresh-token') {
        if (!hasValidRefreshToken(request, env.REFRESH_TOKEN)) {
          return reply.unauthorized('Invalid refresh token');
        }
        return;
      }
      try {
        await request.jwtVerify();
      } catch {
        return reply.unauthorized('Not logged in');
      }
    });
  },
  { name: 'auth' },
);
