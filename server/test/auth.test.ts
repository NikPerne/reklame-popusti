import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, login, TEST_REFRESH_TOKEN, testEnv, type TestApp } from './helpers.js';

describe('authentication', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.app.close();
  });

  it('rejects a wrong password', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.cookies).toHaveLength(0);
  });

  it('rejects a malformed login body with 400', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });

    expect(response.statusCode).toBe(400);
  });

  it('sets an httpOnly, SameSite=Strict session cookie on success', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'correct horse battery staple' },
    });

    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === 'session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
  });

  it('marks the cookie Secure in production', async () => {
    t = await buildTestApp(await testEnv({ NODE_ENV: 'production' }));

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'correct horse battery staple' },
    });

    expect(response.cookies.find((c) => c.name === 'session')?.secure).toBe(true);
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

  it('protects unknown routes too (default deny)', async () => {
    t = await buildTestApp();

    const response = await t.app.inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(401);
  });

  it('rate-limits login attempts per IP', async () => {
    t = await buildTestApp(await testEnv({ LOGIN_RATE_LIMIT_MAX: '2' }));
    const attempt = () =>
      t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'wrong' } });

    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
  });

  it('ignores a spoofed X-Forwarded-For beyond the trusted proxy hops', async () => {
    t = await buildTestApp(await testEnv({ LOGIN_RATE_LIMIT_MAX: '1', TRUST_PROXY_HOPS: '0' }));
    const attempt = (ip: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': ip },
        payload: { password: 'wrong' },
      });

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
