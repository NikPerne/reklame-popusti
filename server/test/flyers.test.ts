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

  describe('GET /api/flyers/:id/pdf', () => {
    const tus: Flyer = {
      id: 'tus-571',
      store: 'tus',
      title: 'Akcijski katalog',
      sourceUrl: 'https://www.tus.si/katalogi/?uid=571',
      viewer: 'pdf',
      url: 'https://www.tus.si/app/uploads/catalogues/a45.pdf',
    };

    it('passes the PDF through with its range', async () => {
      t.flyers.flyers.push(tus);
      const requests: { url: string; headers: Headers }[] = [];
      t.fetchFlyerFile = async (input, init) => {
        requests.push({
          url: input instanceof Request ? input.url : input.toString(),
          headers: new Headers(init?.headers),
        });
        return new Response('%PDF-1.7', {
          status: 206,
          headers: {
            'content-type': 'application/pdf',
            'content-length': '8',
            'content-range': 'bytes 0-7/46645074',
            'accept-ranges': 'bytes',
            'set-cookie': 'tracking=1',
          },
        });
      };

      const response = await get('/api/flyers/tus-571/pdf', { cookie, range: 'bytes=0-7' });

      expect(response.statusCode).toBe(206);
      expect(response.body).toBe('%PDF-1.7');
      expect(response.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-range': 'bytes 0-7/46645074',
        'accept-ranges': 'bytes',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(requests).toHaveLength(1);
      expect(requests[0]!.url).toBe(tus.url);
      expect(requests[0]!.headers.get('range')).toBe('bytes=0-7');
      expect(requests[0]!.headers.get('user-agent')).toMatch(/reklame-popusti/);
    });

    it('only serves stored PDF flyers on allowed hosts', async () => {
      t.flyers.flyers.push({ ...tus, id: 'tus-evil', url: 'https://evil.example/a.pdf' });
      let fetched = false;
      t.fetchFlyerFile = async () => {
        fetched = true;
        return new Response('');
      };

      expect((await get('/api/flyers/tus-evil/pdf')).statusCode).toBe(404);
      expect((await get('/api/flyers/hofer-letaki/pdf')).statusCode).toBe(404);
      expect((await get('/api/flyers/nope/pdf')).statusCode).toBe(404);
      expect(fetched).toBe(false);
    });

    it('reports a failing store as a bad gateway', async () => {
      t.flyers.flyers.push(tus);
      t.fetchFlyerFile = async () => new Response('gone', { status: 404 });

      expect((await get('/api/flyers/tus-571/pdf')).statusCode).toBe(502);
    });
  });

  it('lets the app frame only the stores’ flyer viewers', async () => {
    const response = await get('/api/flyers');

    expect(response.headers['content-security-policy']).toContain(
      'frame-src https://letak.spar.si https://katalogi.mercator.si https://www.eurospin.si',
    );
  });
});
