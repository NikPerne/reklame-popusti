import { describe, expect, it } from 'vitest';
import {
  pricePointFor,
  samePrice,
  summarizeHistory,
  type PricePoint,
} from '../../src/domain/price-history.js';
import { offer } from '../helpers.js';

const at = new Date('2026-11-03T04:10:00Z');
const point = (price: number, from: string, to = from, regularPrice?: number): PricePoint => ({
  price,
  ...(regularPrice !== undefined && { regularPrice }),
  from: new Date(from),
  to: new Date(to),
});

describe('pricePointFor', () => {
  it('records the price and the regular price', () => {
    expect(pricePointFor(offer('spar', { price: 1.09, regularPrice: 1.49 }), at)).toEqual({
      price: 1.09,
      regularPrice: 1.49,
      from: at,
      to: at,
    });
  });

  it('skips offers that have not started yet', () => {
    const nextWeek = offer('lidl', { validFrom: new Date('2026-11-09T23:00:00Z') });
    expect(pricePointFor(nextWeek, at)).toBeUndefined();
  });
});

describe('samePrice', () => {
  it('compares the price and the regular price', () => {
    const last = point(1.09, '2026-11-01', '2026-11-02', 1.49);
    expect(samePrice(last, point(1.09, '2026-11-03', '2026-11-03', 1.49))).toBe(true);
    expect(samePrice(last, point(1.09, '2026-11-03'))).toBe(false);
    expect(samePrice(last, point(1.19, '2026-11-03', '2026-11-03', 1.49))).toBe(false);
  });
});

describe('summarizeHistory', () => {
  it('finds the lowest, highest and the last time it was cheaper', () => {
    const summary = summarizeHistory([
      point(1.49, '2026-09-01', '2026-09-20'),
      point(0.99, '2026-09-21', '2026-09-27', 1.49),
      point(1.49, '2026-09-28', '2026-10-15'),
      point(1.19, '2026-10-16', '2026-10-22', 1.49),
      point(1.59, '2026-10-23', '2026-11-03'),
    ]);

    expect(summary).toEqual({
      trackedSince: new Date('2026-09-01'),
      lowest: 0.99,
      highest: 1.59,
      current: 1.59,
      lastLower: { price: 1.19, on: new Date('2026-10-22') },
    });
  });

  it('has no lastLower when the current price is the lowest so far', () => {
    const summary = summarizeHistory([point(2.49, '2026-10-01'), point(1.99, '2026-10-20')]);
    expect(summary?.lastLower).toBeUndefined();
    expect(summary?.lowest).toBe(1.99);
  });

  it('is undefined without points', () => {
    expect(summarizeHistory([])).toBeUndefined();
  });
});
