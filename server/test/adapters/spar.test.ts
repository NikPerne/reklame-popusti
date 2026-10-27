import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SPAR_CATALOGUE_PATHS,
  SPAR_FLYER_PATHS,
  sparAdapter,
  sparPageUrl,
} from '../../src/adapters/spar/spar-adapter.js';
import {
  extractSparPageCount,
  extractSparProducts,
  parseSparProduct,
} from '../../src/adapters/spar/parse-spar.js';
import { scrapedOfferSchema } from '../../src/domain/offer.js';
import type { HttpClient, RequestOptions } from '../../src/scraping/polite-http-client.js';
import { silentLogger } from '../helpers.js';

/** Products from online.spar.si (2026-10-26) re-encoded in the page's Next.js flight format. */
const html = readFileSync(new URL('../fixtures/spar/iz-letaka.html', import.meta.url), 'utf8');
const now = new Date('2026-10-26T06:00:00Z');
const { products, invalid } = extractSparProducts(html);
const offers = products.flatMap((p) => parseSparProduct(p, now) ?? []);
const bySku = (sku: string) => offers.find((o) => o.externalId === sku);

describe('Spar parsing', () => {
  it('reads every product from the flight payload', () => {
    expect(invalid).toBe(0);
    expect(products).toHaveLength(7);
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('uses the promotion price, dates and unit price', () => {
    expect(bySku('334863')).toEqual({
      externalId: '334863',
      productName: 'Paradižnikova kremna juha, podravka, 60g',
      brand: 'Podravka',
      category: 'shramba',
      price: 1.09,
      regularPrice: 1.49,
      unitPrice: { amount: 18.17, unit: 'kg' },
      validFrom: new Date('2026-10-20T22:00:00Z'),
      validTo: new Date('2026-10-27T21:59:59Z'),
      imageUrl: expect.stringMatching(/^https:\/\/cdn1\.interspar\.at\//) as unknown,
      sourceUrl: 'https://online.spar.si/p/paradiznikova-kremna-juha-podravka-60g-334863',
      eans: ['3850104048036', '3850104274619', '3850104474613', '3850104875410'],
    });
  });

  it('prices products sold by weight per kg', () => {
    expect(bySku('628956')).toMatchObject({
      price: 9.99,
      regularPrice: 14.99,
      unitPrice: { amount: 9.99, unit: 'kg' },
      category: 'meso-ribe',
    });
  });

  it('keeps flyer items without a promotion at their normal price, without a discount', () => {
    const shampoo = bySku('626037');

    expect(shampoo).toMatchObject({ price: 1.49, unitPrice: { amount: 1.49, unit: 'l' } });
    expect(shampoo?.regularPrice).toBeUndefined();
    expect(shampoo?.validTo).toBeUndefined();
  });

  it('marks catalogue products without a promotion as regular, but not promoted ones', () => {
    const shampoo = products.find((p) => p.sku === '626037')!;
    const soup = products.find((p) => p.sku === '334863')!;

    expect(parseSparProduct(shampoo, now, 'catalogue')).toMatchObject({
      price: 1.49,
      regular: true,
    });
    expect(parseSparProduct(soup, now, 'catalogue')).toMatchObject({ price: 1.09 });
    expect(parseSparProduct(soup, now, 'catalogue')?.regular).toBeUndefined();
  });

  it('reads the number of pages from the pagination data', () => {
    const page = 'x\\"pagination\\":{\\"page\\":1,\\"pages\\":12,\\"total\\":{}';
    expect(extractSparPageCount(page)).toBe(12);
    expect(extractSparPageCount('no pagination here')).toBeUndefined();
  });

  it('maps Spar categories', () => {
    expect(bySku('629295')?.category).toBe('gospodinjstvo');
    expect(bySku('670685')?.category).toBe('otroci');
    expect(bySku('498211')?.category).toBe('sadje-zelenjava');
  });

  it('drops offers whose promotion has ended', () => {
    const product = products.find((p) => p.sku === '334863')!;
    expect(parseSparProduct(product, new Date('2026-11-01T00:00:00Z'))).toBeUndefined();
  });
});

describe('sparAdapter', () => {
  it('only runs inside the visiting hours spar.si asks for (04:00–08:45 UTC)', () => {
    expect(sparAdapter.isAllowedAt?.(new Date('2026-10-26T04:17:00Z'))).toBe(true);
    expect(sparAdapter.isAllowedAt?.(new Date('2026-10-26T08:45:00Z'))).toBe(true);
    expect(sparAdapter.isAllowedAt?.(new Date('2026-10-26T10:17:00Z'))).toBe(false);
    expect(sparAdapter.isAllowedAt?.(new Date('2026-10-26T03:59:00Z'))).toBe(false);
  });

  function fakeHttp(page: (url: string) => string = () => html) {
    const calls: { url: string; options: RequestOptions | undefined }[] = [];
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async (url, options) => {
        calls.push({ url, options });
        return page(url);
      },
    };
    return { http, calls };
  }

  it('reads the offer pages, then the whole catalogue, with 10 s between requests', async () => {
    // 7 products: a short page, so each category stops after page 1.
    const { http, calls } = fakeHttp();

    const result = await sparAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(calls.map((c) => c.url)).toEqual(
      [...SPAR_FLYER_PATHS, ...SPAR_CATALOGUE_PATHS].map((p) => sparPageUrl(p, 1)),
    );
    expect(calls.every((c) => c.options?.minDelayMs === 10_000)).toBe(true);
    // Products seen on the offer pages keep that version: the shampoo stays a flyer item.
    expect(result).toHaveLength(7);
    expect(result.find((o) => o.externalId === '626037')?.regular).toBeUndefined();
    expect(sparPageUrl(SPAR_FLYER_PATHS[0]!, 2)).toMatch(/\?currentPage=2$/);
  });

  it('stops before the visiting hours end and keeps the previous offers', async () => {
    const { http, calls } = fakeHttp();
    let minutes = 0;
    // Each request moves the clock on; 08:45 is reached after a few pages.
    const clock = () => new Date(Date.UTC(2026, 9, 26, 8, 40 + minutes++));

    await expect(sparAdapter.fetchOffers({ http, log: silentLogger, now, clock })).rejects.toThrow(
      /visiting hours ended/,
    );
    expect(calls.length).toBeLessThan(10);
  });
});
