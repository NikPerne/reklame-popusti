/**
 * API types. These mirror the server's domain model (server/src/domain, server/src/repositories);
 * keep them in sync when the API changes.
 */

export const STORE_IDS = ['mercator', 'lidl', 'hofer', 'spar', 'dm', 'mueller'] as const;
export type StoreId = (typeof STORE_IDS)[number];

export const CATEGORY_IDS = [
  'sadje-zelenjava',
  'meso-ribe',
  'mlecni-izdelki',
  'kruh-pekovsko',
  'shramba',
  'sladko-slano',
  'pijace',
  'zamrznjeno',
  'drogerija',
  'gospodinjstvo',
  'otroci',
  'zivali',
  'dom-vrt',
  'tehnika',
  'oblacila',
  'drugo',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const OFFER_SORTS = ['relevance', 'price', 'unitPrice', 'discount', 'validTo'] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];

export type UnitPriceUnit = 'kg' | 'l' | 'piece';
export type ConditionKind = 'loyalty-card' | 'multi-buy' | 'coupon' | 'other';

export interface Offer {
  id: string;
  store: StoreId;
  externalId: string;
  productName: string;
  brand?: string;
  category: CategoryId;
  sourceCategory?: string;
  price: number;
  regularPrice?: number;
  discountPercent?: number;
  unitPrice?: { amount: number; unit: UnitPriceUnit };
  condition?: { kind: ConditionKind; text: string };
  /** ISO date strings */
  validFrom?: string;
  validTo?: string;
  imageUrl?: string;
  sourceUrl?: string;
  scrapedAt: string;
}

export interface OfferPage {
  items: Offer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StoreStatus {
  lastRunAt: string;
  ok: boolean;
  offerCount: number;
  durationMs: number;
  error?: string;
}

export interface StoreInfo {
  id: StoreId;
  name: string;
  website: string;
  status: StoreStatus | null;
}

export interface CategoryCount {
  category: CategoryId;
  count: number;
}
