import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Flyer } from '../src/domain/flyer.js';
import { EUROSPIN_FLYER, HOFER_FLYER } from '../src/flyers/parse-flyers.js';
import { buildTestApp, login, type TestApp } from './helpers.js';

const day = 86_400_000;
const lidl = (id: string, validFrom: number, validTo: number): Flyer => ({
  id: `lidl-${id}`,
  store: 'lidl',
  title: id,
  validFrom: new Date(Date.now() + validFrom * day),
  validTo: new Date(Date.now() + validTo * day),
  sourceUrl: 'https://www.lidl.si/',
  viewer: 'pages',
  pages: [{ image: 'https://imgproxy.leaflets.schwarz/p1.jpg' }],
});

describe('flyer routes', () => {
  let t: TestApp;
  let cookie: string;

  beforeEach(async () => {
    t = await buildTestApp();
    cookie = await login(t.app);
    t.flyers.flyers = [
      EUROSPIN_FLYER,
      lidl('next-week', 2, 9),
      lidl('ended', -9, -1),
      lidl('this-week', -2, 5),
      HOFER_FLYER,
    ];
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (url: string, headers: Record<string, string> = { cookie }) =>
    t.app.inject({ method: 'GET', url, headers });

  it('lists current flyers by store, soonest first, without their pages', async () => {
    const response = await get('/api/flyers');

    expect(response.statusCode).toBe(200);
    const flyers = response.json<{ id: string; pages?: unknown; pageCount?: number }[]>();
    expect(flyers.map((f) => f.id)).toEqual([
      'lidl-this-week',
      'lidl-next-week',
      'hofer-letaki',
      'eurospin-letak',
    ]);
    expect(flyers[0]).toMatchObject({ pageCount: 1 });
    expect(flyers[0]).not.toHaveProperty('pages');
  });

  it('returns one flyer with its pages', async () => {
    const response = await get('/api/flyers/lidl-this-week');

    expect(response.json()).toMatchObject({
      id: 'lidl-this-week',
      pages: [{ image: 'https://imgproxy.leaflets.schwarz/p1.jpg' }],
    });
    expect((await get('/api/flyers/nope')).statusCode).toBe(404);
  });

  it('needs a session', async () => {
    expect((await get('/api/flyers', {})).statusCode).toBe(401);
  });

  it('lets the app frame only the stores’ flyer viewers', async () => {
    const response = await get('/api/flyers');

    expect(response.headers['content-security-policy']).toContain(
      'frame-src https://letak.spar.si https://katalogi.mercator.si https://www.eurospin.si',
    );
  });
});
