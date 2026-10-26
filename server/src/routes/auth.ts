import { timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { Env } from '../config/env.js';
import { loginSchema, signupSchema, type User } from '../domain/account.js';
import { parseOrBadRequest } from '../lib/validation.js';
import { SESSION_COOKIE } from '../plugins/auth.js';
import type { UserRepository } from '../repositories/user-repository.js';

type AuthRouteOptions = Pick<
  Env,
  | 'NODE_ENV'
  | 'SIGNUP_CODE'
  | 'SESSION_TTL_HOURS'
  | 'LOGIN_RATE_LIMIT_MAX'
  | 'LOGIN_RATE_LIMIT_WINDOW_MINUTES'
> & { users: UserRepository };

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const { users, ...env } = options;
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  } as const;
  const rateLimit = {
    max: env.LOGIN_RATE_LIMIT_MAX,
    timeWindow: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  };
  // Checked when the email is unknown, so a login takes as long whether or not the account exists.
  const dummyHash = hash('not-a-real-password');

  const startSession = async (reply: FastifyReply, user: User) => {
    const token = await reply.jwtSign({ sub: user.id, email: user.email });
    return reply
      .setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: env.SESSION_TTL_HOURS * 3600 })
      .send({ email: user.email });
  };

  app.post(
    '/api/auth/signup',
    { config: { auth: 'public', rateLimit } },
    async (request, reply) => {
      const { email, password, code } = parseOrBadRequest(signupSchema, request.body);
      if (!env.SIGNUP_CODE || !sameSecret(code, env.SIGNUP_CODE)) {
        request.log.warn({ ip: request.ip }, 'signup with a wrong code');
        return reply.forbidden('Wrong invite code');
      }
      const user = await users.create({
        email,
        passwordHash: await hash(password),
        createdAt: new Date(),
      });
      if (user === 'exists') return reply.conflict('An account with this email already exists');
      request.log.info({ email }, 'account created');
      return startSession(reply.code(201), user);
    },
  );

  app.post('/api/auth/login', { config: { auth: 'public', rateLimit } }, async (request, reply) => {
    const { email, password } = parseOrBadRequest(loginSchema, request.body);
    const user = await users.findByEmail(email);
    const valid = await verify(user?.passwordHash ?? (await dummyHash), password).catch(
      () => false,
    );
    if (!user || !valid) {
      request.log.warn({ ip: request.ip }, 'failed login attempt');
      return reply.unauthorized('Wrong email or password');
    }
    return startSession(reply, user);
  });

  app.post('/api/auth/logout', async (_request, reply) =>
    reply.clearCookie(SESSION_COOKIE, cookieOptions).send({ ok: true }),
  );

  app.get('/api/auth/me', async (request) => ({ email: request.user.email }));
};
