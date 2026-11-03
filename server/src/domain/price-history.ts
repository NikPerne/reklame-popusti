import type { Offer } from './offer.js';

/** A price that held from `from` to `to` (the first and last refresh that saw it). */
export interface PricePoint {
  price: number;
  /** The store's regular price at the time, when it published one (i.e. it was on sale). */
  regularPrice?: number;
  from: Date;
  to: Date;
}

/** Points kept per product: one is added only when the price changes, so this is years. */
export const MAX_HISTORY_POINTS = 400;
/** Products that have not been seen for this long are forgotten. */
export const HISTORY_RETENTION_DAYS = 400;

/**
 * The point an offer adds at `at`, or undefined for offers that have not started yet (next
 * week's flyer): their price is not today's price.
 */
export function pricePointFor(offer: Offer, at: Date): PricePoint | undefined {
  if (offer.validFrom && offer.validFrom > at) return undefined;
  return {
    price: offer.price,
    ...(offer.regularPrice !== undefined && { regularPrice: offer.regularPrice }),
    from: at,
    to: at,
  };
}

/** Whether `next` continues `last` (same prices) instead of starting a new point. */
export function samePrice(last: PricePoint, next: PricePoint): boolean {
  return last.price === next.price && last.regularPrice === next.regularPrice;
}

export interface HistorySummary {
  /** When the first point was recorded. */
  trackedSince: Date;
  lowest: number;
  highest: number;
  /** The latest price. */
  current: number;
  /** The last time the price was lower than now; missing if it never was. */
  lastLower?: { price: number; on: Date };
}

export function summarizeHistory(points: readonly PricePoint[]): HistorySummary | undefined {
  const last = points.at(-1);
  const first = points[0];
  if (!first || !last) return undefined;
  const prices = points.map((p) => p.price);
  const lower = points.findLast((p) => p.price < last.price);
  return {
    trackedSince: first.from,
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    current: last.price,
    ...(lower && { lastLower: { price: lower.price, on: lower.to } }),
  };
}
