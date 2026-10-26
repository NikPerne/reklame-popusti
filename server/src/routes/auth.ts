import { verify } from '@node-rs/argon2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { parseOrBadRequest } from '../lib/validation.js';
import { SESSION_COOKIE } from '../plugins/auth.js';

const loginBodySchema = z.object({ password: z.string().min(1).max(256) });

type AuthRouteOptions = Pick<
  Env,
  | 'NODE_ENV'
  | 'APP_PASSWORD_HASH'
  | 'SESSION_TTL_HOURS'
  | 'LOGIN_RATE_LIMIT_MAX'
  | 'LOGIN_RATE_LIMIT_WINDOW_MINUTES'
>;

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, env) => {
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  } as const;

  app.post(
    '/api/auth/login',
    {
      config: {
        auth: 'public',
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT_MAX,
          timeWindow: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
        },
      },
    },
    async (request, reply) => {
      const { password } = parseOrBadRequest(loginBodySchema, request.body);
      const valid = await verify(env.APP_PASSWORD_HASH, password).catch(() => false);
      if (!valid) {
        request.log.warn('failed login attempt');
        return reply.unauthorized('Wrong password');
      }

      const token = await reply.jwtSign({ sub: 'owner' });
      return reply
        .setCookie(SESSION_COOKIE, token, {
          ...cookieOptions,
          maxAge: env.SESSION_TTL_HOURS * 3600,
        })
        .send({ ok: true });
    },
  );

  app.post('/api/auth/logout', async (_request, reply) =>
    reply.clearCookie(SESSION_COOKIE, cookieOptions).send({ ok: true }),
  );

  app.get('/api/auth/me', async () => ({ authenticated: true }));
};
