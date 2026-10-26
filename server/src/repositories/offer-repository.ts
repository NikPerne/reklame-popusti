import type { CategoryId } from '../domain/categories.js';
import type { Offer } from '../domain/offer.js';
import type { StoreId } from '../domain/stores.js';

export const OFFER_SORTS = ['relevance', 'price', 'unitPrice', 'discount', 'validTo'] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];

export interface OfferQuery {
  text?: string;
  stores?: StoreId[];
  category?: CategoryId;
  minDiscount?: number;
  /** Only offers for this barcode (barcode scanner). */
  ean?: string;
  /** `relevance` only applies with `text`; otherwise it falls back to `discount`. */
  sort: OfferSort;
  page: number;
  pageSize: number;
  /** Offers whose validTo is before this are hidden even if the TTL index hasn't removed them yet. */
  now: Date;
}

/** Another store's (or a duplicate listing's) offer for the same product. */
export interface OfferAlternative {
  id: string;
  store: StoreId;
  productName: string;
  price: number;
  unitPrice?: Offer['unitPrice'];
  condition?: Offer['condition'];
  sourceUrl?: string;
}

export type OfferView = Omit<Offer, 'searchText' | 'expiresAt' | 'groupKey'> & {
  id: string;
  /** The same product elsewhere (shared barcode or duplicate listing), when there is any. */
  alsoAt?: OfferAlternative[];
};

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
  /** Links offers for the same product (see computeGroups); returns the number of groups. */
  regroup(): Promise<number>;
  saveStoreStatus(status: StoreStatus): Promise<void>;
  storeStatuses(): Promise<StoreStatus[]>;
}
