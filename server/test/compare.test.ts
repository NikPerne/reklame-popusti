import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, login, offer, type TestApp } from './helpers.js';

describe('GET /api/compare', () => {
  let t: TestApp;
  let cookie: string;

  beforeEach(async () => {
    t = await buildTestApp();
    cookie = await login(t.app);
    t.repository.offers = [
      offer('mercator', {
        externalId: 'm1',
        productName: 'Maslo, Mila, 250 g',
        price: 2.39,
        unitPrice: { amount: 9.56, unit: 'kg' },
        regular: true,
        regularPrice: undefined,
      }),
      offer('lidl', {
        externalId: 'l1',
        productName: 'Irsko maslo, 250 g',
        price: 1.55,
        unitPrice: { amount: 6.2, unit: 'kg' },
      }),
      offer('mercator', {
        externalId: 'm2',
        productName: 'Arašidovo maslo, 1 kg',
        price: 8.99,
        unitPrice: { amount: 8.99, unit: 'kg' },
      }),
    ];
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (query: string) =>
    t.app.inject({ method: 'GET', url: `/api/compare?${query}`, headers: { cookie } });

  it('needs a session', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/compare?q=maslo' });
    expect(response.statusCode).toBe(401);
  });

  it('compares the type across stores, everyday prices included', async () => {
    const response = await get('q=maslo&exclude=arasidov');

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      unit: string;
      stores: { store: string; cheapest: { productName: string; regular?: boolean } }[];
      items: unknown[];
      total: number;
    }>();
    expect(body.unit).toBe('kg');
    expect(body.stores.map((s) => s.store)).toEqual(['lidl', 'mercator']);
    expect(body.stores[1]?.cheapest).toMatchObject({
      productName: 'Maslo, Mila, 250 g',
      regular: true,
    });
    expect(body.total).toBe(2);
    expect(t.repository.candidateQueries.at(-1)).toMatchObject({ text: 'maslo' });
  });

  it('leaves out products removed by hand and passes the store filter on', async () => {
    const response = await get('q=maslo&exclude=arasidov&skip=lidl:l1&store=lidl,mercator');

    expect(response.json<{ stores: { store: string }[] }>().stores.map((s) => s.store)).toEqual([
      'mercator',
    ]);
    expect(t.repository.candidateQueries.at(-1)?.stores).toEqual(['lidl', 'mercator']);
  });

  it('compares what a misspelled search most likely meant, and says so', async () => {
    const response = await get('q=malso&exclude=arasidov');

    const body = response.json<{ correctedQuery?: string; total: number }>();
    expect(body.correctedQuery).toBe('maslo');
    expect(body.total).toBe(2);
    expect(
      (await get('q=maslo')).json<{ correctedQuery?: string }>().correctedQuery,
    ).toBeUndefined();
  });

  it('passes a category on', async () => {
    await get('q=maslo&category=mlecni-izdelki');
    expect(t.repository.candidateQueries.at(-1)?.category).toBe('mlecni-izdelki');
  });

  it.each(['', 'q=m', 'q=maslo&store=konzum', 'q=maslo&category=nope'])(
    'rejects "%s" with 400',
    async (query) => {
      expect((await get(query)).statusCode).toBe(400);
    },
  );

  describe('GET /api/offers/:id/related', () => {
    it('compares the product with its ready-made type (butter) in all stores', async () => {
      const response = await t.app.inject({
        method: 'GET',
        url: '/api/offers/mercator:m1/related',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        offer: { id: string };
        query: { text: string; presetId?: string };
        comparison: { stores: { store: string }[] };
      }>();
      expect(body.offer.id).toBe('mercator:m1');
      expect(body.query).toMatchObject({ text: 'maslo', presetId: 'butter' });
      // Peanut butter is left out by the preset.
      expect(body.comparison.stores.map((s) => s.store)).toEqual(['lidl', 'mercator']);
    });

    it('guesses the type of products without a ready-made comparison', async () => {
      t.repository.offers.push(
        offer('spar', {
          externalId: 's1',
          productName: 'Ajvar blagi, 350 g',
          category: 'shramba',
          unitPrice: { amount: 7.11, unit: 'kg' },
        }),
        offer('mercator', {
          externalId: 'm3',
          productName: 'Ajvar, Podravka, 350 g',
          category: 'shramba',
          unitPrice: { amount: 8.26, unit: 'kg' },
        }),
      );

      const response = await t.app.inject({
        method: 'GET',
        url: '/api/offers/spar:s1/related',
        headers: { cookie },
      });

      const body = response.json<{ query: { text: string }; comparison: { total: number } }>();
      expect(body.query.text).toBe('ajvar');
      expect(body.comparison.total).toBe(2);
    });

    it('compares a guessed type only within the product’s category', async () => {
      t.repository.offers.push(
        offer('spar', {
          externalId: 's2',
          productName: 'Krema Lino Lada, 400 g',
          category: 'sladko-slano',
          unitPrice: { amount: 9.9, unit: 'kg' },
        }),
        offer('dm', {
          externalId: 'd1',
          productName: 'Krema za roke, 100 ml',
          category: 'drogerija',
          unitPrice: { amount: 29.9, unit: 'l' },
        }),
      );

      const response = await t.app.inject({
        method: 'GET',
        url: '/api/offers/spar:s2/related',
        headers: { cookie },
      });

      const body = response.json<{
        query: { text: string; category?: string };
        comparison: { items: { productName: string }[] };
      }>();
      expect(body.query).toMatchObject({ text: 'krema', category: 'sladko-slano' });
      expect(body.comparison.items.map((i) => i.productName)).toEqual(['Krema Lino Lada, 400 g']);
      expect(t.repository.candidateQueries.at(-1)?.category).toBe('sladko-slano');
    });

    it('answers 404 for an unknown offer', async () => {
      const response = await t.app.inject({
        method: 'GET',
        url: '/api/offers/nope/related',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  it('lists the quick picks', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/compare/presets',
      headers: { cookie },
    });
    expect(response.json<{ id: string }[]>().map((p) => p.id)).toContain('butter');
  });
});
