import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  login,
  signup,
  TEST_EMAIL,
  TEST_PASSWORD,
  TEST_REFRESH_TOKEN,
  TEST_SIGNUP_CODE,
  testEnv,
  type TestApp,
} from './helpers.js';

describe('authentication', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  const loginAs = (email: string, password: string, headers: Record<string, string> = {}) =>
    t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { email, password },
    });

  const signupWith = (payload: Record<string, string>) =>
    t.app.inject({ method: 'POST', url: '/api/auth/signup', payload });

  it('rejects a wrong password and an unknown email alike', async () => {
    t = await buildTestApp();

    const wrongPassword = await loginAs(TEST_EMAIL, 'wrong');
    const unknownEmail = await loginAs('nobody@example.com', TEST_PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
    expect(wrongPassword.cookies).toHaveLength(0);
  });

  it('rejects a malformed login body with 400', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(400);
  });

  it('matches the email case-insensitively', async () => {
    t = await buildTestApp();

    const response = await loginAs(` ${TEST_EMAIL.toUpperCase()} `, TEST_PASSWORD);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: TEST_EMAIL });
  });

  it('sets an httpOnly, SameSite=Strict session cookie on success', async () => {
    t = await buildTestApp();

    const response = await loginAs(TEST_EMAIL, TEST_PASSWORD);

    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === 'session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
  });

  it('marks the cookie Secure in production', async () => {
    t = await buildTestApp(testEnv({ NODE_ENV: 'production' }));

    const response = await loginAs(TEST_EMAIL, TEST_PASSWORD);

    expect(response.cookies.find((c) => c.name === 'session')?.secure).toBe(true);
  });

  it('tells the app who is logged in', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: await login(t.app) },
    });

    expect(response.json()).toEqual({ email: TEST_EMAIL });
  });

  it('requires a session for protected endpoints', async () => {
    t = await buildTestApp();

    const anonymous = await t.app.inject({ method: 'GET', url: '/api/offers' });
    const forged = await t.app.inject({
      method: 'GET',
      url: '/api/offers',
      headers: { cookie: 'session=not-a-jwt' },
    });
    const authenticated = await t.app.inject({
      method: 'GET',
      url: '/api/offers',
      headers: { cookie: await login(t.app) },
    });

    expect(anonymous.statusCode).toBe(401);
    expect(forged.statusCode).toBe(401);
    expect(authenticated.statusCode).toBe(200);
  });

  it('rejects sessions from before accounts existed', async () => {
    t = await buildTestApp();
    const oldToken = t.app.jwt.sign({ sub: 'owner' } as never);

    const response = await t.app.inject({
      method: 'GET',
      url: '/api/offers',
      headers: { cookie: `session=${oldToken}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it('protects unknown routes too (default deny)', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(401);
  });

  it('rate-limits login attempts per IP', async () => {
    t = await buildTestApp(testEnv({ LOGIN_RATE_LIMIT_MAX: '2' }));

    expect((await loginAs(TEST_EMAIL, 'wrong')).statusCode).toBe(401);
    expect((await loginAs(TEST_EMAIL, 'wrong')).statusCode).toBe(401);
    expect((await loginAs(TEST_EMAIL, 'wrong')).statusCode).toBe(429);
  });

  it('ignores a spoofed X-Forwarded-For beyond the trusted proxy hops', async () => {
    t = await buildTestApp(testEnv({ LOGIN_RATE_LIMIT_MAX: '1', TRUST_PROXY_HOPS: '0' }));
    const attempt = (ip: string) => loginAs(TEST_EMAIL, 'wrong', { 'x-forwarded-for': ip });

    expect((await attempt('1.1.1.1')).statusCode).toBe(401);
    expect((await attempt('2.2.2.2')).statusCode).toBe(429);
  });

  it('logout clears the cookie', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: await login(t.app) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.find((c) => c.name === 'session')?.value).toBe('');
  });

  describe('signup', () => {
    it('creates an account with the invite code and logs it in', async () => {
      t = await buildTestApp();

      const response = await signupWith({
        email: 'Teja@Example.com',
        password: 'a long password',
        code: TEST_SIGNUP_CODE,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ email: 'teja@example.com' });
      expect(response.cookies.find((c) => c.name === 'session')).toBeDefined();
      expect((await loginAs('teja@example.com', 'a long password')).statusCode).toBe(200);
      // Only the hash is stored.
      const stored = t.users.users.find((u) => u.email === 'teja@example.com');
      expect(stored?.passwordHash).toMatch(/^\$argon2/);
    });

    it('refuses a wrong invite code', async () => {
      t = await buildTestApp();

      const response = await signupWith({
        email: 'teja@example.com',
        password: 'a long password',
        code: 'guess',
      });

      expect(response.statusCode).toBe(403);
      expect(response.cookies).toHaveLength(0);
      expect(t.users.users).toHaveLength(1);
    });

    it('is closed when no invite code is configured', async () => {
      const env = testEnv();
      delete env.SIGNUP_CODE;
      t = await buildTestApp(env);

      const response = await signupWith({
        email: 'teja@example.com',
        password: 'a long password',
        code: TEST_SIGNUP_CODE,
      });

      expect(response.statusCode).toBe(403);
    });

    it('refuses an email that already has an account', async () => {
      t = await buildTestApp();

      const response = await signupWith({
        email: TEST_EMAIL,
        password: 'a long password',
        code: TEST_SIGNUP_CODE,
      });

      expect(response.statusCode).toBe(409);
    });

    it('validates the email and password length', async () => {
      t = await buildTestApp();

      const badEmail = await signupWith({
        email: 'not-an-email',
        password: 'a long password',
        code: TEST_SIGNUP_CODE,
      });
      const shortPassword = await signupWith({
        email: 'teja@example.com',
        password: 'short',
        code: TEST_SIGNUP_CODE,
      });

      expect(badEmail.statusCode).toBe(400);
      expect(shortPassword.statusCode).toBe(400);
    });

    it('works for a second account through the helper', async () => {
      t = await buildTestApp();

      const cookie = await signup(t.app, 'second@example.com');
      const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });

      expect(me.json()).toEqual({ email: 'second@example.com' });
    });
  });

  describe('POST /api/admin/refresh', () => {
    it('needs the refresh token, not a session', async () => {
      t = await buildTestApp();

      const withSession = await t.app.inject({
        method: 'POST',
        url: '/api/admin/refresh',
        headers: { cookie: await login(t.app) },
      });
      const withToken = await t.app.inject({
        method: 'POST',
        url: '/api/admin/refresh',
        headers: { 'x-refresh-token': TEST_REFRESH_TOKEN },
      });

      expect(withSession.statusCode).toBe(401);
      expect(withToken.statusCode).toBe(202);
      expect(t.refreshCalls).toBe(1);
    });
  });
});
