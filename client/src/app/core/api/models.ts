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

export const OFFER_SORTS = [
  'relevance',
  'price',
  'unitPrice',
  'discount',
  'validTo',
  'newest',
] as const;
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
  /** Not on sale: the everyday price from the store's online catalogue (Mercator, Spar). */
  regular?: boolean;
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
  /** Last successful refresh (ISO); missing if there has never been one. */
  lastSuccessAt?: string;
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

/** An offer that has a unit price (everything in a price comparison does). */
export type ComparedOffer = Offer & { unitPrice: { amount: number; unit: UnitPriceUnit } };

/** GET /api/compare: the same type of product (e.g. butter) compared across stores per unit. */
export interface Comparison {
  /** Unit of all compared prices; missing when nothing matched. */
  unit?: UnitPriceUnit;
  /** Each store's cheapest product per unit, cheapest store first. */
  stores: { store: StoreId; cheapest: ComparedOffer; count: number }[];
  /** Compared products, cheapest per unit first (at most 100). */
  items: ComparedOffer[];
  /** All compared products. */
  total: number;
  /** Matches without a unit price, or in another unit. */
  notComparable: number;
}

/** A ready-made comparison (quick pick); `id` is the translation key under `compare.presets`. */
export interface ComparePreset {
  id: string;
  q: string;
  exclude: string[];
}

/** GET /api/offers/:id/related: one offer and products of the same type in all stores. */
export interface RelatedOffers {
  offer: Offer;
  /** The type the offer was compared as; null when none could be found in its name. */
  query: { text: string; exclude: string[]; presetId?: string } | null;
  comparison: Comparison | null;
}
