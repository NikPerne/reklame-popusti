import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mercatorAdapter, mercatorPageUrl } from '../../src/adapters/mercator/mercator-adapter.js';
import {
  mercatorProductsResponseSchema,
  type MercatorProduct,
} from '../../src/adapters/mercator/mercator-api.js';
import {
  mapMercatorCategory,
  parseMercatorDate,
  parseMercatorProduct,
  parseMercatorProducts,
} from '../../src/adapters/mercator/parse-mercator.js';
import { scrapedOfferSchema } from '../../src/domain/offer.js';
import type { HttpClient, RequestOptions } from '../../src/scraping/polite-http-client.js';
import { silentLogger } from '../helpers.js';

/** Trimmed real responses from 2026-10-26 (allergen lists removed). */
function fixture(page: 0 | 1): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../fixtures/mercator/products-page-${page}.json`, import.meta.url),
      'utf8',
    ),
  ) as unknown;
}

const products = [0, 1].flatMap(
  (page) => mercatorProductsResponseSchema.parse(fixture(page as 0 | 1)).products,
);
const now = new Date('2026-10-26T08:00:00Z');
const offers = parseMercatorProducts(products, now);
const byId = (id: string) => offers.find((o) => o.externalId === id);
const product = (id: string): MercatorProduct =>
  structuredClone(products.find((p) => p.itemId === id)!);

describe('parseMercatorProducts', () => {
  it('turns every price-reduced product into a valid offer and skips the rest', () => {
    expect(products).toHaveLength(12);
    expect(offers).toHaveLength(11);
    // "Pivo Union" only carries an action marker without a lower price.
    expect(byId('313163')).toBeUndefined();
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('reads a straight price cut ("Ugodno")', () => {
    expect(byId('1436803')).toEqual({
      externalId: '1436803',
      productName: 'Sončnično olje, Zvijezda, 1 l',
      brand: 'Zvijezda',
      category: 'shramba',
      sourceCategory: 'Osnovna živila / shramba / Olje / Sončnično olje',
      price: 1.85,
      regularPrice: 2.99,
      unitPrice: { amount: 1.85, unit: 'l' },
      validFrom: new Date('2026-10-23T21:37:52Z'),
      validTo: new Date('2026-11-03T22:37:52Z'),
      imageUrl: expect.stringMatching(/^https:\/\/mercatoronline\.si\/img\//) as unknown,
      sourceUrl: 'https://mercatoronline.si/izdelek/1436803/soncnicno-olje-zvijezda-1-l',
      eans: ['3858882210010', '3858882212410'],
    });
  });

  it('marks Pika card prices with a loyalty-card condition', () => {
    expect(byId('17249589')).toMatchObject({
      price: 4.99,
      regularPrice: 8.69,
      condition: { kind: 'loyalty-card', text: 'Pika kartica' },
    });
  });

  it('computes the per-item price of a multi-buy deal and rescales the unit price', () => {
    expect(byId('1395879')).toMatchObject({
      productName: 'Mleta kava Classic, Barcaffe, 200 g',
      price: 3.59, // 4.79 - 25 %
      regularPrice: 4.79,
      unitPrice: { amount: 17.95, unit: 'kg' },
      condition: { kind: 'multi-buy', text: 'Ob nakupu 2 ali več' },
    });
  });

  it('drops an end date that is already in the past while the shop still shows the price', () => {
    const offer = byId('39483');
    expect(offer).toMatchObject({ price: 4.89, regularPrice: 6.99 });
    expect(offer?.validTo).toBeUndefined();
  });

  it('keeps the cheapest deal when a product has several', () => {
    const p = product('1436803'); // 2.99 -> 1.85
    p.data.discounts.push({
      ...p.data.discounts[0]!,
      marker_code: '100',
      hover_text: 'Ob nakupu 3 izdelkov ali več je vsak 40% ceneje.',
    });

    expect(parseMercatorProduct(p, now)).toMatchObject({
      price: 1.11, // 1.85 - 40 %
      regularPrice: 1.85,
      condition: { kind: 'multi-buy', text: 'Ob nakupu 3 ali več' },
    });
  });

  it('ignores products without a usable price', () => {
    const p = product('1436803');
    p.data.current_price = '0';
    expect(parseMercatorProduct(p, now)).toBeUndefined();
  });
});

describe('Mercator helpers', () => {
  it('maps top-level categories regardless of case and diacritics', () => {
    expect(mapMercatorCategory('MLEKO, JAJCA IN MLEČNI IZDELKI')).toBe('mlecni-izdelki');
    expect(mapMercatorCategory('Čistila')).toBe('gospodinjstvo');
    expect(mapMercatorCategory('NEKAJ NOVEGA')).toBe('drugo');
    expect(mapMercatorCategory(undefined)).toBe('drugo');
  });

  it('parses dates as Ljubljana local time across daylight saving', () => {
    expect(parseMercatorDate('20260715120000')).toEqual(new Date('2026-07-15T10:00:00Z'));
    expect(parseMercatorDate('20261201120000')).toEqual(new Date('2026-12-01T11:00:00Z'));
    expect(parseMercatorDate('20260329030000')).toEqual(new Date('2026-03-29T01:00:00Z'));
    expect(parseMercatorDate('nonsense')).toBeUndefined();
  });

  it('builds page URLs with page index as offset and item index as from', () => {
    const url = new URL(mercatorPageUrl(2));
    expect(url.pathname).toBe('/products/browseProducts/getProducts');
    expect(url.searchParams.get('offset')).toBe('2');
    expect(url.searchParams.get('from')).toBe('160');
    expect(url.searchParams.get('filterData[discounts]')).toContain('104');
  });
});

describe('mercatorAdapter.fetchOffers', () => {
  /** Serves pages of clones of the fixture products: `sizes[i]` products on page i. */
  function fakeHttp(sizes: number[], total: number) {
    const calls: { url: string; options: RequestOptions | undefined }[] = [];
    const template = products[0]!;
    const http: HttpClient = {
      fetchText: () => Promise.reject(new Error('unexpected')),
      fetchJson: async (url, options) => {
        calls.push({ url, options });
        const page = Number(new URL(url).searchParams.get('offset'));
        const count = sizes[page] ?? 0;
        return {
          products: Array.from({ length: count }, (_, i) => ({
            ...template,
            itemId: `${page}-${i}`,
            total,
          })),
        };
      },
    };
    return { http, calls };
  }

  it('fetches pages until a short page and sends the XHR header', async () => {
    const { http, calls } = fakeHttp([80, 80, 5], 999);

    const result = await mercatorAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.options?.headers).toEqual({ 'x-requested-with': 'XMLHttpRequest' });
    expect(result).toHaveLength(165);
  });

  it('stops once the reported total is reached', async () => {
    const { http, calls } = fakeHttp([80, 80, 80], 160);

    await mercatorAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(calls).toHaveLength(2);
  });

  it('fails loudly when the response shape changes', async () => {
    const http: HttpClient = {
      fetchText: () => Promise.reject(new Error('unexpected')),
      fetchJson: async () => ({ items: [] }),
    };

    await expect(mercatorAdapter.fetchOffers({ http, log: silentLogger, now })).rejects.toThrow();
  });
});
