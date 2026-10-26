import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lidlAdapter } from '../../src/adapters/lidl/lidl-adapter.js';
import {
  extractLidlProducts,
  findLidlOfferPages,
  parseLidlProduct,
} from '../../src/adapters/lidl/parse-lidl.js';
import { scrapedOfferSchema, type ScrapedOffer } from '../../src/domain/offer.js';
import type { HttpClient } from '../../src/scraping/polite-http-client.js';
import { silentLogger } from '../helpers.js';

/** Trimmed copies of lidl.si pages from 2026-10-26 (see the comment at the top of each file). */
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/lidl/${name}`, import.meta.url), 'utf8');

const now = new Date('2026-10-26T08:00:00Z');

function parsePage(name: string): ScrapedOffer[] {
  const slug = name.replace('.html', '');
  return extractLidlProducts(fixture(name)).products.flatMap(
    (p) => parseLidlProduct(p, slug, now) ?? [],
  );
}

const thursday = parsePage('super-ponudba-od-cetrtka.html');
const byId = (offers: ScrapedOffer[], id: string) => offers.find((o) => o.externalId === id);

describe('findLidlOfferPages', () => {
  it('finds the offer pages (/c/<topic>/a<id>) and ignores content pages', () => {
    const pages = findLidlOfferPages(fixture('home.html'));

    expect(pages).toHaveLength(23);
    expect(pages).toContain('/c/super-ponudba-od-cetrtka/a10105501');
    expect(pages).toContain('/c/vse-za-avto-parkside/a10105515');
    expect(pages.every((p) => /^\/c\/[a-z0-9-]+\/a\d+$/.test(p))).toBe(true);
  });
});

describe('extractLidlProducts', () => {
  it('reads every product from the page without errors', () => {
    expect(extractLidlProducts(fixture('super-ponudba-od-cetrtka.html'))).toMatchObject({
      invalid: 0,
    });
    expect(extractLidlProducts(fixture('super-ponudba-od-cetrtka.html')).products).toHaveLength(30);
  });

  it('counts malformed grid data instead of failing', () => {
    const result = extractLidlProducts(
      '<div data-grid-data="{oops"></div><div data-grid-data="{}"></div>',
    );

    expect(result).toEqual({ products: [], invalid: 2 });
  });
});

describe('parseLidlProduct', () => {
  it('produces valid offers', () => {
    expect(thursday.length).toBeGreaterThan(20);
    for (const offer of thursday) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('uses the Lidl Plus price with a loyalty-card condition', () => {
    expect(byId(thursday, '11257586')).toEqual({
      externalId: '11257586',
      productName: 'Šunka, 200 g',
      brand: 'Pikok',
      category: 'meso-ribe',
      sourceCategory: 'Food',
      price: 1.29,
      regularPrice: 2.19,
      discountPercent: 41,
      unitPrice: { amount: 6.45, unit: 'kg' },
      condition: { kind: 'loyalty-card', text: 'Lidl Plus' },
      validFrom: new Date('2026-10-21T22:00:00Z'),
      validTo: new Date('2026-10-28T22:59:59Z'),
      imageUrl: expect.stringMatching(/^https:\/\/www\.lidl\.si\/assets\//) as unknown,
      sourceUrl: 'https://www.lidl.si/p/pikok-sunka/p11257586',
    });
  });

  it('keeps weekly offers without an old price, without a discount', () => {
    const beer = byId(thursday, '11257031');

    expect(beer).toMatchObject({
      productName: 'Temno pivo, 4 x 0,5 l',
      price: 4.69,
      category: 'pijace',
    });
    expect(beer?.regularPrice).toBeUndefined();
    expect(beer?.discountPercent).toBeUndefined();
    expect(beer?.condition).toBeUndefined();
  });

  it('skips offers whose in-store period has ended and products without a price', () => {
    const ids = thursday.map((o) => o.externalId);

    expect(ids).not.toContain('11151114'); // pepper, ended 24 Oct
    expect(ids).not.toContain('11256514'); // potatoes, ended 24 Oct
    expect(ids).not.toContain('11256757'); // Gin & Tonic, no price
  });

  it('gives every variant its own id', () => {
    const variants = thursday.filter((o) => o.externalId.startsWith('11000079'));

    expect(new Set(variants.map((o) => o.externalId)).size).toBe(variants.length);
    expect(variants.length).toBeGreaterThan(1);
  });

  it('cleans up titles and placeholder brands', () => {
    const cola = thursday.find((o) => o.productName.includes('Malibu'));
    expect(cola?.productName).toBe('Malibu Cola, 250 ml');

    const noBrand = thursday.filter((o) => o.brand !== undefined);
    expect(noBrand.every((o) => /\p{L}/u.test(o.brand ?? ''))).toBe(true);
  });

  it('maps Lidl categories and guesses the rest from the name and page', () => {
    const flowers = parsePage('cvetlicarna.html');
    const tools = parsePage('vse-za-avto-parkside.html');

    expect(flowers.every((o) => o.category === 'dom-vrt')).toBe(true);
    expect(byId(tools, '11101748')?.category).toBe('dom-vrt');
    expect(byId(thursday, '11008851')?.category).toBe('gospodinjstvo'); // WC block, filed as Food
    expect(byId(thursday, '11007593003')?.category).toBe('sladko-slano'); // "Keksi … z mlekom"
  });
});

describe('lidlAdapter.fetchOffers', () => {
  function fakeHttp(pages: Record<string, string | Error>) {
    const requested: string[] = [];
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async (url) => {
        requested.push(url);
        const page = pages[new URL(url).pathname];
        if (page === undefined) throw new Error(`404 ${url}`);
        if (page instanceof Error) throw page;
        return page;
      },
    };
    return { http, requested };
  }

  const home = `<a href="/c/super-ponudba-od-cetrtka/a10105501">a</a>
    <a href="https://www.lidl.si/c/cvetlicarna/a10025105">b</a>
    <a href="/c/super-ponudba-od-cetrtka/a10105501">duplicate</a>
    <a href="/c/informacije/s10019917">content page</a>`;

  it('reads the homepage, then each offer page once', async () => {
    const { http, requested } = fakeHttp({
      '/': home,
      '/c/super-ponudba-od-cetrtka/a10105501': fixture('super-ponudba-od-cetrtka.html'),
      '/c/cvetlicarna/a10025105': fixture('cvetlicarna.html'),
    });

    const offers = await lidlAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(requested.map((u) => new URL(u).pathname)).toEqual([
      '/',
      '/c/super-ponudba-od-cetrtka/a10105501',
      '/c/cvetlicarna/a10025105',
    ]);
    expect(offers.length).toBe(thursday.length + parsePage('cvetlicarna.html').length);
  });

  it('keeps going when one offer page fails', async () => {
    const { http } = fakeHttp({
      '/': home,
      '/c/super-ponudba-od-cetrtka/a10105501': new Error('timeout'),
      '/c/cvetlicarna/a10025105': fixture('cvetlicarna.html'),
    });

    const offers = await lidlAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(offers).toHaveLength(parsePage('cvetlicarna.html').length);
  });

  it('fails when the homepage no longer links any offer pages', async () => {
    const { http } = fakeHttp({ '/': '<html>redesigned</html>' });

    await expect(lidlAdapter.fetchOffers({ http, log: silentLogger, now })).rejects.toThrow(
      /no offer pages/,
    );
  });
});
