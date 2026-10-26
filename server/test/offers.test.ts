import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, login, offer, type TestApp } from './helpers.js';

describe('offer endpoints', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
    cookie = await login(t.app);
    t.repository.offers = [
      offer('lidl'),
      offer('dm', { externalId: 'p2', productName: 'Pralni prašek' }),
    ];
  });

  afterAll(async () => {
    await t.app.close();
  });

  const get = (url: string) => t.app.inject({ method: 'GET', url, headers: { cookie } });

  it('passes parsed filters to the repository', async () => {
    const response = await get(
      '/api/offers?q=kava&store=lidl,dm&category=shramba&minDiscount=30&sort=price&page=2&pageSize=10',
    );

    expect(response.statusCode).toBe(200);
    expect(t.repository.queries.at(-1)).toMatchObject({
      text: 'kava',
      stores: ['lidl', 'dm'],
      category: 'shramba',
      minDiscount: 30,
      sort: 'price',
      page: 2,
      pageSize: 10,
    });
  });

  it('sorts by relevance when searching and by discount otherwise', async () => {
    await get('/api/offers?q=kava');
    expect(t.repository.queries.at(-1)?.sort).toBe('relevance');

    await get('/api/offers');
    expect(t.repository.queries.at(-1)?.sort).toBe('discount');
  });

  it('returns offers without internal fields', async () => {
    const body = (await get('/api/offers?q=kava')).json<{ items: Record<string, unknown>[] }>();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      store: 'lidl',
      productName: 'Mleta kava',
      discountPercent: 33,
    });
    expect(body.items[0]).not.toHaveProperty('searchText');
  });

  it.each([
    ['/api/offers?store=konzum', 'unknown store'],
    ['/api/offers?category=nope', 'unknown category'],
    ['/api/offers?minDiscount=150', 'discount over 100'],
    ['/api/offers?pageSize=1000', 'page size over the limit'],
    ['/api/offers?q=k', 'one-letter query'],
    ['/api/stores/konzum/offers', 'unknown store in path'],
  ])('rejects %s (%s) with 400', async (url) => {
    expect((await get(url)).statusCode).toBe(400);
  });

  it('lists a store and a category through the path', async () => {
    await get('/api/stores/dm/offers?minDiscount=20');
    expect(t.repository.queries.at(-1)).toMatchObject({ stores: ['dm'], minDiscount: 20 });

    await get('/api/categories/drogerija/offers');
    expect(t.repository.queries.at(-1)).toMatchObject({ category: 'drogerija' });
  });

  it('lists all stores with their last refresh status', async () => {
    t.repository.statuses = [
      { store: 'lidl', lastRunAt: new Date(), ok: true, offerCount: 120, durationMs: 5000 },
    ];

    const stores = (await get('/api/stores')).json<{ id: string; status: unknown }[]>();

    expect(stores.map((s) => s.id)).toEqual([
      'mercator',
      'lidl',
      'hofer',
      'spar',
      'dm',
      'mueller',
      'eurospin',
      'tus',
    ]);
    expect(stores.find((s) => s.id === 'lidl')?.status).toMatchObject({
      ok: true,
      offerCount: 120,
    });
    expect(stores.find((s) => s.id === 'dm')?.status).toBeNull();
  });
});
