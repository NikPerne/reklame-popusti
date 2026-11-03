import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, login, offer, type TestApp } from './helpers.js';

describe('GET /api/offers/:id/history', () => {
  let t: TestApp;
  let cookie: string;

  beforeEach(async () => {
    t = await buildTestApp();
    cookie = await login(t.app);
    t.repository.offers = [offer('spar', { externalId: '334863', price: 1.09 })];
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (id: string, headers: Record<string, string> = { cookie }) =>
    t.app.inject({ method: 'GET', url: `/api/offers/${id}/history`, headers });

  it('returns the points of the offer and a summary', async () => {
    t.history.points.set('spar/334863', [
      { price: 1.49, from: new Date('2026-10-01'), to: new Date('2026-10-20') },
      { price: 1.09, regularPrice: 1.49, from: new Date('2026-10-21'), to: new Date('2026-11-03') },
    ]);

    const response = await get('spar:334863');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      points: [
        { price: 1.49, from: '2026-10-01T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z' },
        {
          price: 1.09,
          regularPrice: 1.49,
          from: '2026-10-21T00:00:00.000Z',
          to: '2026-11-03T00:00:00.000Z',
        },
      ],
      summary: {
        trackedSince: '2026-10-01T00:00:00.000Z',
        lowest: 1.09,
        highest: 1.49,
        current: 1.09,
      },
    });
  });

  it('returns an empty history for a product without one', async () => {
    expect((await get('spar:334863')).json()).toEqual({ points: [], summary: null });
  });

  it('returns 404 for an unknown offer and 401 without a session', async () => {
    expect((await get('spar:nope')).statusCode).toBe(404);
    expect((await get('spar:334863', {})).statusCode).toBe(401);
  });
});
