import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tusAdapter, tusPageUrl } from '../../src/adapters/tus/tus-adapter.js';
import {
  TUS_LISTS,
  extractTusPage,
  mapTusCategory,
  parseTusCard,
} from '../../src/adapters/tus/parse-tus.js';
import { scrapedOfferSchema } from '../../src/domain/offer.js';
import type { HttpClient } from '../../src/scraping/polite-http-client.js';
import { silentLogger } from '../helpers.js';

/** Trimmed copies of tus.si offer lists from 2026-10-26. */
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/tus/${name}`, import.meta.url), 'utf8');
const catalogue = extractTusPage(fixture('aktualno-iz-kataloga.html'));
const club = extractTusPage(fixture('tus-klub-50.html'));
const catalogueOffers = catalogue.cards.flatMap((c) => parseTusCard(c, false) ?? []);
const clubOffers = club.cards.flatMap((c) => parseTusCard(c, true) ?? []);

describe('Tuš parsing', () => {
  it('reads cards and the number of pages', () => {
    expect(catalogue.cards).toHaveLength(10);
    expect(catalogue.lastPage).toBe(15);
    expect(club.cards).toHaveLength(6);
    expect(club.lastPage).toBe(3);
    for (const offer of [...catalogueOffers, ...clubOffers]) {
      expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
    }
  });

  it('reads price, regular price, discount, brand, image and link', () => {
    expect(catalogueOffers[0]).toEqual({
      externalId: '405532',
      productName: 'Alpro sojin, fermantiran, okus borovničev mafin, 400 g',
      brand: 'Alpro',
      category: 'mlecni-izdelki',
      sourceCategory: 'shramba',
      price: 2.09,
      regularPrice: 2.59,
      discountPercent: 19,
      unitPrice: { amount: 5.225, unit: 'kg' },
      imageUrl: 'https://www.tus.si/app/images/5411188141488.jpg',
      sourceUrl: 'https://www.tus.si/izdelki/alpro-sojin-fermantiran-okus-borovnicev-mafin-400-g/',
      eans: ['5411188141488'],
    });
  });

  it('decodes HTML entities in names', () => {
    expect(catalogueOffers.some((o) => o.productName.includes('Black & White'))).toBe(true);
  });

  it('marks Tuš klub prices with a loyalty-card condition', () => {
    expect(clubOffers[0]).toMatchObject({
      productName: 'Čips Lorenz, X - cut, kisla smetana, 130 g',
      price: 1.19,
      regularPrice: 2.49,
      discountPercent: 52,
      condition: { kind: 'loyalty-card', text: 'Tuš klub' },
    });
    expect(catalogueOffers.every((o) => o.condition === undefined)).toBe(true);
  });

  it('maps subcategories first, then main categories, then guesses', () => {
    expect(mapTusCategory('shramba', 'mlecni-izdelki', 'Alpro sojin')).toBe('mlecni-izdelki');
    expect(mapTusCategory('brezalkoholne-pijace', undefined, 'Cockta Original, 1,5 l')).toBe(
      'pijace',
    );
    expect(mapTusCategory(undefined, undefined, 'Hrenovke Perutnina Ptuj')).toBe('meso-ribe');
  });
});

describe('tusAdapter.fetchOffers', () => {
  it('reads every page of both lists and keeps the cheaper offer for a product in both', async () => {
    const requested: string[] = [];
    // The same product (id 405524) in the catalogue at a higher price than with the club card.
    const catalogueWithClubProduct = fixture('aktualno-iz-kataloga.html').replace(
      'data-gtm4wp_product_id="405532"',
      'data-gtm4wp_product_id="405524"',
    );
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async (url) => {
        requested.push(url);
        if (url.includes('tus-klub-50')) return fixture('tus-klub-50.html');
        return catalogueWithClubProduct;
      },
    };

    const offers = await tusAdapter.fetchOffers({ http, log: silentLogger, now: new Date() });

    expect(requested).toHaveLength(15 + 3);
    expect(requested[0]).toBe(tusPageUrl(TUS_LISTS[0].path, 1));
    expect(requested[1]).toBe(`${tusPageUrl(TUS_LISTS[0].path, 1)}page/2/`);
    expect(offers.find((o) => o.externalId === '405524')).toMatchObject({
      price: 1.19,
      condition: { text: 'Tuš klub' },
    });
  });

  it('fails when the lists no longer contain products', async () => {
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async () => '<html>redesigned</html>',
    };

    await expect(
      tusAdapter.fetchOffers({ http, log: silentLogger, now: new Date() }),
    ).rejects.toThrow(/no offers/);
  });
});
