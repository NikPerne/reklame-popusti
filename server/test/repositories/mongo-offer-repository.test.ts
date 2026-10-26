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
      $search: { index: 'default', text: { query: 'kava' } },
    });
    expect(pipeline).toContainEqual({ $addFields: { _score: { $meta: 'searchScore' } } });
    expect(pipeline).toContainEqual({ $sort: { _score: -1, _id: 1 } });
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

  it('sorts by unit price with offers lacking one placed last', () => {
    const pipeline = buildPipeline({ ...base, sort: 'unitPrice' }, 'atlas');

    expect(pipeline).toContainEqual({
      $addFields: { _sortKey: { $ifNull: ['$unitPrice.amount', 1e12] } },
    });
    expect(pipeline).toContainEqual({ $sort: { _sortKey: 1, _id: 1 } });
    expect(pipeline.at(-1)).toHaveProperty('$facet.items.2.$project._sortKey', 0);
  });

  it('sorts undated offers last when sorting by expiry', () => {
    const pipeline = buildPipeline({ ...base, sort: 'validTo' }, 'atlas');

    expect(pipeline).toContainEqual({
      $addFields: { _sortKey: { $ifNull: ['$validTo', new Date(1e15)] } },
    });
  });

  it('collapses offers for the same product into one result with "also at" alternatives', () => {
    const pipeline = buildPipeline({ ...base, sort: 'price' }, 'atlas');
    const groupIndex = pipeline.findIndex((s) => '$group' in s);

    expect(pipeline[groupIndex]).toMatchObject({
      $group: { _id: { $ifNull: ['$groupKey', '$_id'] }, best: { $first: '$$ROOT' } },
    });
    // Sorted before grouping (so the best offer comes first) and again after.
    expect(pipeline[groupIndex - 1]).toEqual({ $sort: { price: 1, _id: 1 } });
    expect(pipeline[groupIndex + 2]).toEqual({ $sort: { price: 1, _id: 1 } });
  });

  it('paginates inside the facet', () => {
    const pipeline = buildPipeline({ ...base, page: 3, pageSize: 10 }, 'atlas');

    expect(pipeline.at(-1)).toMatchObject({
      $facet: { items: [{ $skip: 20 }, { $limit: 10 }, expect.anything()] },
    });
  });
});

describe('buildFilter with a barcode', () => {
  it('matches offers listing that barcode', () => {
    const [stage] = buildPipeline({ ...base, ean: '3858882210010' }, 'atlas');
    expect(stage).toHaveProperty('$match.eans', '3858882210010');
  });
});

describe('buildFilter with hidden categories', () => {
  it('excludes them unless one category is chosen explicitly', () => {
    expect(buildPipeline({ ...base, excludeCategories: ['oblacila'] }, 'atlas')[0]).toHaveProperty(
      '$match.category',
      { $nin: ['oblacila'] },
    );
    expect(
      buildPipeline({ ...base, category: 'pijace', excludeCategories: ['oblacila'] }, 'atlas')[0],
    ).toHaveProperty('$match.category', 'pijace');
  });
});
