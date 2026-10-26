import type { CategoryId } from '../domain/categories.js';
import type { Offer } from '../domain/offer.js';
import type { StoreId } from '../domain/stores.js';

export const OFFER_SORTS = ['relevance', 'price', 'discount', 'validTo'] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];

export interface OfferQuery {
  text?: string;
  stores?: StoreId[];
  category?: CategoryId;
  minDiscount?: number;
  /** `relevance` only applies with `text`; otherwise it falls back to `discount`. */
  sort: OfferSort;
  page: number;
  pageSize: number;
  /** Offers whose validTo is before this are hidden even if the TTL index hasn't removed them yet. */
  now: Date;
}

export type OfferView = Omit<Offer, 'searchText' | 'expiresAt'> & { id: string };

export interface OfferPage {
  items: OfferView[];
  total: number;
}

export interface StoreStatus {
  store: StoreId;
  lastRunAt: Date;
  ok: boolean;
  offerCount: number;
  durationMs: number;
  error?: string;
}

export interface ReplaceResult {
  upserted: number;
  removed: number;
}

/** Persistence boundary. The Mongo implementation is used in production, a fake in tests. */
export interface OfferRepository {
  find(query: OfferQuery): Promise<OfferPage>;
  categoryCounts(now: Date): Promise<{ category: CategoryId; count: number }[]>;
  /** Upserts the store's current offers and removes the ones not seen in this run. */
  replaceStoreOffers(store: StoreId, offers: Offer[], runStartedAt: Date): Promise<ReplaceResult>;
  saveStoreStatus(status: StoreStatus): Promise<void>;
  storeStatuses(): Promise<StoreStatus[]>;
}
