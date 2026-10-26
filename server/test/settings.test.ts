import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, login, type TestApp } from './helpers.js';

describe('settings API', () => {
  let t: TestApp;
  let cookie: string;

  beforeEach(async () => {
    t = await buildTestApp();
    cookie = await login(t.app);
  });

  afterEach(async () => {
    await t.app.close();
  });

  const put = (body: object) =>
    t.app.inject({ method: 'PUT', url: '/api/settings', headers: { cookie }, payload: body });
  const get = () => t.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });

  it('returns empty defaults before anything is saved', async () => {
    expect((await get()).json()).toMatchObject({ preferredStores: [], hiddenCategories: [] });
  });

  it('saves settings and keeps the newer copy', async () => {
    await put({
      preferredStores: ['lidl', 'mercator'],
      hiddenCategories: ['oblacila'],
      updatedAt: '2026-10-26T12:00:00Z',
    });
    const older = await put({
      preferredStores: [],
      hiddenCategories: [],
      updatedAt: '2026-10-26T11:00:00Z',
    });

    expect(older.json()).toMatchObject({ preferredStores: ['lidl', 'mercator'] });
    expect((await get()).json()).toMatchObject({ hiddenCategories: ['oblacila'] });
  });

  it('rejects unknown stores and categories', async () => {
    const response = await put({
      preferredStores: ['konzum'],
      hiddenCategories: [],
      updatedAt: '2026-10-26T12:00:00Z',
    });
    expect(response.statusCode).toBe(400);
  });

  it('needs a session', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/settings' })).statusCode).toBe(401);
  });
});

describe('hiding categories in search', () => {
  it('passes excluded categories to the repository', async () => {
    const t = await buildTestApp();
    const cookie = await login(t.app);

    await t.app.inject({
      method: 'GET',
      url: '/api/offers?excludeCategory=oblacila,tehnika',
      headers: { cookie },
    });

    expect(t.repository.queries.at(-1)).toMatchObject({
      excludeCategories: ['oblacila', 'tehnika'],
    });
    await t.app.close();
  });
});
