import { describe, expect, it } from 'vitest';
import { finalizeOffer, normalizeSearchText, scrapedOfferSchema } from '../../src/domain/offer.js';
import { scrapedOffer } from '../helpers.js';

describe('normalizeSearchText', () => {
  it.each([
    ['Pralni PRAŠEK', 'pralni prasek'],
    ['Čokolada  Žito', 'cokolada zito'],
    ['Đumbir', 'dumbir'],
    ['Müller Crème', 'muller creme'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });
});

describe('finalizeOffer', () => {
  const scrapedAt = new Date('2026-10-25T06:00:00Z');

  it('computes the discount from the regular price when the store does not give one', () => {
    const offer = finalizeOffer('lidl', scrapedOffer({ price: 3, regularPrice: 4 }), scrapedAt);
    expect(offer.discountPercent).toBe(25);
  });

  it("keeps the store's own discount percentage", () => {
    const offer = finalizeOffer('lidl', scrapedOffer({ discountPercent: 30 }), scrapedAt);
    expect(offer.discountPercent).toBe(30);
  });

  it('leaves the discount empty without a regular price', () => {
    const { regularPrice: _r, ...withoutRegular } = scrapedOffer();
    expect(finalizeOffer('lidl', withoutRegular, scrapedAt).discountPercent).toBeUndefined();
  });

  it('expires one day after validTo, or a week after scraping if undated', () => {
    const dated = finalizeOffer('lidl', scrapedOffer(), scrapedAt);
    expect(dated.expiresAt.toISOString()).toBe('2026-10-31T00:00:00.000Z');

    const { validTo: _v, ...undated } = scrapedOffer();
    expect(finalizeOffer('dm', undated, scrapedAt).expiresAt.toISOString()).toBe(
      '2026-11-01T06:00:00.000Z',
    );
  });

  it('builds a diacritic-free searchText from name, brand and source category', () => {
    const offer = finalizeOffer(
      'spar',
      scrapedOffer({ productName: 'Pralni prašek', brand: 'Persil', sourceCategory: 'Čistila' }),
      scrapedAt,
    );
    expect(offer.searchText).toBe('pralni prasek persil cistila');
  });
});

describe('scrapedOfferSchema', () => {
  it('rejects a regular price below the current price', () => {
    expect(scrapedOfferSchema.safeParse(scrapedOffer({ price: 5, regularPrice: 4 })).success).toBe(
      false,
    );
  });

  it('rejects validFrom after validTo', () => {
    const result = scrapedOfferSchema.safeParse(
      scrapedOffer({ validFrom: new Date('2026-11-01'), validTo: new Date('2026-10-01') }),
    );
    expect(result.success).toBe(false);
  });
});
