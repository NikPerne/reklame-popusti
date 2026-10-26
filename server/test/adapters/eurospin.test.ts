import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eurospinAdapter } from '../../src/adapters/eurospin/eurospin-adapter.js';
import {
  EUROSPIN_OFFERS_URL,
  extractEurospinCards,
  findEurospinCategories,
  mapEurospinCategory,
  parseEurospinCard,
  parseEurospinDates,
} from '../../src/adapters/eurospin/parse-eurospin.js';
import { scrapedOfferSchema } from '../../src/domain/offer.js';
import type { HttpClient } from '../../src/scraping/polite-http-client.js';
import { silentLogger } from '../helpers.js';

/** Trimmed copies of eurospin.si pages from 2026-10-26. */
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/eurospin/${name}`, import.meta.url), 'utf8');
const mainPage = fixture('akcije.html');
const dairyPage = fixture('akcije-mlecni-izdelki.html');
const now = new Date('2026-10-26T08:00:00Z');

const cards = extractEurospinCards(mainPage);
const offers = cards.flatMap((c) => parseEurospinCard(c, now) ?? []);
const byName = (start: string) => offers.find((o) => o.productName.startsWith(start));

describe('Eurospin parsing', () => {
  it('reads the product cards and the category links', () => {
    expect(cards).toHaveLength(10);
    expect(findEurospinCategories(mainPage)).toHaveLength(26);
    expect(findEurospinCategories(mainPage)[0]?.url).toMatch(
      /^https:\/\/www\.eurospin\.si\/akcije\/\?category_filter=/,
    );
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('reads prices, size, unit price and validity', () => {
    expect(byName('Milanska salama')).toEqual({
      externalId: '11371001',
      productName: 'Milanska salama, rezine, 150 g',
      brand: 'La Bottega Del Gusto',
      category: 'meso-ribe',
      price: 1.05,
      regularPrice: 1.35,
      unitPrice: { amount: 7, unit: 'kg' },
      validFrom: new Date('2026-10-21T22:00:00Z'),
      validTo: new Date('2026-10-28T22:59:59Z'),
      imageUrl: 'https://www.eurospin.si/wp-content/uploads/smt/11371001.jpg',
      sourceUrl: EUROSPIN_OFFERS_URL,
    });
  });

  it("skips next week's preview cards that don't show a price yet", () => {
    expect(offers).toHaveLength(8);
    expect(byName('Čistilo za steklene')).toBeUndefined();
  });

  it('keeps cards without an old price, without a discount', () => {
    const flowers = byName('Šopek krizantem');
    expect(flowers).toMatchObject({ price: 4.49, category: 'dom-vrt' });
    expect(flowers?.regularPrice).toBeUndefined();
  });

  it('uses Eurospin’s category when known, otherwise guesses from the name', () => {
    expect(mapEurospinCategory('mleČni izdelki', 'Mocarela, 125 g')).toBe('mlecni-izdelki');
    expect(mapEurospinCategory('narezki in sveŽi izdelki', 'Mortadela s pistacijami')).toBe(
      'meso-ribe',
    );
    expect(mapEurospinCategory(undefined, 'Klementine, nepakirane')).toBe('sadje-zelenjava');
    expect(mapEurospinCategory(undefined, 'Orehova potica, 500 g')).toBe('kruh-pekovsko');
  });
});

describe('parseEurospinDates', () => {
  it('adds the year and runs until the end of the last day, in Ljubljana time', () => {
    expect(parseEurospinDates('29.10 - 4.11', now)).toEqual({
      validFrom: new Date('2026-10-28T23:00:00Z'),
      validTo: new Date('2026-11-04T22:59:59Z'),
    });
  });

  it('handles a range across new year', () => {
    expect(parseEurospinDates('29.12 - 4.1', new Date('2026-12-28T10:00:00Z'))).toEqual({
      validFrom: new Date('2026-12-28T23:00:00Z'),
      validTo: new Date('2027-01-04T22:59:59Z'),
    });
  });

  it('ignores text without dates', () => {
    expect(parseEurospinDates('do razprodaje zalog', now)).toBeUndefined();
  });
});

describe('eurospinAdapter.fetchOffers', () => {
  it('reads the offers page, then the category pages to categorize products', async () => {
    const requested: string[] = [];
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async (url) => {
        requested.push(url);
        if (url === EUROSPIN_OFFERS_URL) return mainPage;
        if (url.includes('mle%C4%8Cni+izdelki') || url.includes('mle%C4%8Cni%20izdelki')) {
          return dairyPage;
        }
        if (url.includes('Trajno')) throw new Error('unexpected');
        return '<html></html>';
      },
    };

    const result = await eurospinAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(requested[0]).toBe(EUROSPIN_OFFERS_URL);
    expect(requested).toHaveLength(27);
    expect(result).toHaveLength(8);
    expect(result.find((o) => o.productName.startsWith('Mocarela'))).toMatchObject({
      category: 'mlecni-izdelki',
      sourceCategory: 'Mlečni izdelki',
    });
  });

  it('still returns offers when a category page fails', async () => {
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async (url) => {
        if (url === EUROSPIN_OFFERS_URL) return mainPage;
        throw new Error('timeout');
      },
    };

    const result = await eurospinAdapter.fetchOffers({ http, log: silentLogger, now });

    expect(result).toHaveLength(8);
  });

  it('fails when the offers page has no product cards', async () => {
    const http: HttpClient = {
      fetchJson: () => Promise.reject(new Error('unexpected')),
      fetchText: async () => '<html>redesigned</html>',
    };

    await expect(eurospinAdapter.fetchOffers({ http, log: silentLogger, now })).rejects.toThrow(
      /no product cards/,
    );
  });
});
