import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hoferAdapter, hoferPageUrl } from '../../src/adapters/hofer/hofer-adapter.js';
import { extractHoferPage, parseHoferProduct } from '../../src/adapters/hofer/parse-hofer.js';
import { scrapedOfferSchema } from '../../src/domain/offer.js';
import type { HttpClient } from '../../src/scraping/polite-http-client.js';
import { silentLogger } from '../helpers.js';

/** Products from hofer.si (2026-10-26) re-encoded in the page's __NUXT_DATA__ format. */
const fixture = (page: 1 | 2) =>
  readFileSync(new URL(`../fixtures/hofer/offers-page-${page}.html`, import.meta.url), 'utf8');

const page1 = extractHoferPage(fixture(1));
const offers = [...page1.products, ...extractHoferPage(fixture(2)).products].flatMap(
  (p) => parseHoferProduct(p) ?? [],
);
const bySku = (sku: string) => offers.find((o) => o.externalId === sku);

describe('extractHoferPage', () => {
  it('reads products and pagination from the Nuxt payload', () => {
    expect(page1).toMatchObject({ invalid: 0, totalCount: 9, pageSize: 6 });
    expect(page1.products).toHaveLength(6);
  });

  it('fails loudly when the page no longer has the search result', () => {
    expect(() =>
      extractHoferPage('<script id="__NUXT_DATA__">[{"pinia":1},{}]</script>'),
    ).toThrow();
  });
});

describe('parseHoferProduct', () => {
  it('produces valid offers', () => {
    expect(offers).toHaveLength(9);
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('reads price, unit price, start date, image and link', () => {
    expect(bySku('000000000000107088')).toEqual({
      externalId: '000000000000107088',
      productName: 'Karamelni vaflji, 400 g',
      brand: 'Finest Bakery',
      category: 'sladko-slano',
      sourceCategory: 'Sladki in slani prigrizki',
      price: 1.95,
      unitPrice: { amount: 4.88, unit: 'kg' },
      validFrom: new Date('2026-11-01T23:00:00Z'), // 2 Nov, Ljubljana time
      imageUrl: expect.stringMatching(
        /^https:\/\/dm\.emea\.cms\.aldi\.cx\/.+\/scaleWidth\/400\/.+\/finest-bakery-karamelni-vaflji$/,
      ) as unknown,
      sourceUrl: 'https://www.hofer.si/izdelek/finest-bakery-karamelni-vaflji-000000000000107088',
    });
  });

  it('has no discount, because Hofer publishes no regular price', () => {
    expect(
      offers.every((o) => o.regularPrice === undefined && o.discountPercent === undefined),
    ).toBe(true);
  });

  it('maps Hofer categories', () => {
    expect(bySku('000000000000200631')?.category).toBe('drogerija'); // Osebna nega
    expect(bySku('000000000000728614')?.category).toBe('gospodinjstvo');
    expect(bySku('000000000000299006')?.category).toBe('pijace');
  });

  it('skips unit prices it cannot normalize', () => {
    // "0,21 €/1 x zvitek" (per roll) has no kg/l/piece equivalent.
    expect(bySku('000000000000200631')?.unitPrice).toBeUndefined();
  });
});

describe('hoferAdapter.fetchOffers', () => {
  it('fetches all pages reported by the first one', async () => {
    const requested: string[] = [];
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async (url) => {
        requested.push(url);
        return url.includes('page=2') ? fixture(2) : fixture(1);
      },
    };

    const result = await hoferAdapter.fetchOffers({ http, log: silentLogger, now: new Date() });

    expect(requested).toEqual([hoferPageUrl(1), hoferPageUrl(2)]);
    expect(result).toHaveLength(9);
  });
});
