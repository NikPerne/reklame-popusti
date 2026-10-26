import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, login, type TestApp } from './helpers.js';

describe('serving the web app', () => {
  let t: TestApp;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'client-'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Popusti</title>');
    writeFileSync(join(root, 'main-7MAUWQK5.js'), 'console.log(1)');
    writeFileSync(join(root, 'ngsw.json'), '{}');
    writeFileSync(join(root, 'ngsw-worker.js'), '// worker');
    mkdirSync(join(root, 'i18n'));
    writeFileSync(join(root, 'i18n', 'sl.json'), '{}');
    t = await buildTestApp(undefined, root);
  });

  afterAll(async () => {
    await t.app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const get = (url: string, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'GET', url, headers });

  it('serves the app without a session, so the login page can load', async () => {
    const response = await get('/');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<title>Popusti</title>');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves index.html for Angular routes', async () => {
    for (const url of ['/login', '/login?returnUrl=%2F', '/some/deep/link']) {
      const response = await get(url);
      expect(response.statusCode, url).toBe(200);
      expect(response.body, url).toContain('<title>Popusti</title>');
    }
  });

  it('caches hashed bundles for a year and service-worker files not at all', async () => {
    expect((await get('/main-7MAUWQK5.js')).headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect((await get('/ngsw.json')).headers['cache-control']).toBe('no-cache');
    expect((await get('/i18n/sl.json')).headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns 404 for missing files instead of the app', async () => {
    const response = await get('/missing.js');

    expect(response.statusCode).toBe(404);
  });

  it('still protects every /api route, known or not', async () => {
    expect((await get('/api/offers')).statusCode).toBe(401);
    expect((await get('/api/nope')).statusCode).toBe(401);
    expect((await get('/api')).statusCode).toBe(401);
  });

  it('answers unknown API routes with a JSON 404 once logged in', async () => {
    const response = await get('/api/nope', { cookie: await login(t.app) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found' });
  });

  it('lets the service worker fetch store images while the page keeps connect-src self', async () => {
    const worker = await get('/ngsw-worker.js');
    const page = await get('/');

    expect(worker.statusCode).toBe(200);
    expect(worker.headers['content-security-policy']).toContain("connect-src 'self' https:");
    expect(page.headers['content-security-policy']).toContain("connect-src 'self';");
  });

  it('sends the security headers', async () => {
    const { headers } = await get('/');

    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});
