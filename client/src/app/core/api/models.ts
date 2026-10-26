/**
 * API types. These mirror the server's domain model (server/src/domain, server/src/repositories);
 * keep them in sync when the API changes.
 */

export const STORE_IDS = [
  'mercator',
  'lidl',
  'hofer',
  'spar',
  'dm',
  'mueller',
  'eurospin',
  'tus',
] as const;
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

/** The same product at another store (or a duplicate listing). */
export interface OfferAlternative {
  id: string;
  store: StoreId;
  productName: string;
  price: number;
  unitPrice?: { amount: number; unit: UnitPriceUnit };
  condition?: { kind: ConditionKind; text: string };
  sourceUrl?: string;
}

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
  /** EAN barcodes (Mercator, Spar, Tuš only). */
  eans?: string[];
  scrapedAt: string;
  /** Other offers for the same product, cheapest first when sorting by price. */
  alsoAt?: OfferAlternative[];
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
