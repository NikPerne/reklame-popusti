import { describe, expect, it } from 'vitest';
import { buildPipeline, buildTextFilter } from '../../src/repositories/mongo-offer-repository.js';
import type { OfferQuery } from '../../src/repositories/offer-repository.js';

const now = new Date('2026-10-26T00:00:00Z');
const base: OfferQuery = { sort: 'discount', page: 1, pageSize: 24, now };

describe('buildTextFilter (basic search mode)', () => {
  it('matches every word, diacritic-insensitively', () => {
    expect(buildTextFilter('Pralni PRAŠEK')).toEqual({
      $and: [{ searchText: { $regex: 'pralni' } }, { searchText: { $regex: 'prasek' } }],
    });
  });

  it('escapes regex characters', () => {
    expect(buildTextFilter('a+b (1l)')).toEqual({
      $and: [{ searchText: { $regex: 'a\\+b' } }, { searchText: { $regex: '\\(1l\\)' } }],
    });
  });
});

describe('buildPipeline', () => {
  it('starts with $search in atlas mode and sorts by search score for relevance', () => {
    const pipeline = buildPipeline({ ...base, text: 'kava', sort: 'relevance' }, 'atlas');

    expect(pipeline[0]).toMatchObject({
      $search: { index: 'offers_search', text: { query: 'kava' } },
    });
    expect(pipeline).toContainEqual({ $sort: { score: { $meta: 'searchScore' }, _id: 1 } });
  });

  it('uses the searchText regex in basic mode and falls back to discount order', () => {
    const pipeline = buildPipeline({ ...base, text: 'kava', sort: 'relevance' }, 'basic');

    expect(pipeline[0]).toHaveProperty('$match.$and');
    expect(pipeline).toContainEqual({ $sort: { discountPercent: -1, _id: 1 } });
  });

  it('applies store, category and discount filters and hides expired offers', () => {
    const [stage] = buildPipeline(
      { ...base, stores: ['lidl'], category: 'pijace', minDiscount: 25 },
      'atlas',
    );

    expect(stage).toEqual({
      $match: {
        $or: [{ validTo: { $exists: false } }, { validTo: { $gte: now } }],
        store: { $in: ['lidl'] },
        category: 'pijace',
        discountPercent: { $gte: 25 },
      },
    });
  });

  it('paginates inside the facet', () => {
    const pipeline = buildPipeline({ ...base, page: 3, pageSize: 10 }, 'atlas');

    expect(pipeline.at(-1)).toMatchObject({
      $facet: { items: [{ $skip: 20 }, { $limit: 10 }, expect.anything()] },
    });
  });
});
