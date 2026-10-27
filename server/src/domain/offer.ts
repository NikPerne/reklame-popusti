import { z } from 'zod';
import { CATEGORY_IDS } from './categories.js';
import type { StoreId } from './stores.js';

/** Units that unit prices are normalized to (€/kg, €/l, €/piece), so offers can be compared. */
export const UNIT_PRICE_UNITS = ['kg', 'l', 'piece'] as const;
export type UnitPriceUnit = (typeof UNIT_PRICE_UNITS)[number];

/**
 * What the shopper must do to get `price`. The owner has every store's loyalty card, so
 * card prices are treated as the real price and the condition is shown as a badge.
 */
export const CONDITION_KINDS = ['loyalty-card', 'multi-buy', 'coupon', 'other'] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

/** EAN-8, UPC-A, EAN-13 or GTIN-14. */
export const EAN_PATTERN = /^\d{8,14}$/;

/** Clean, de-duplicated barcodes, or undefined if there are none. */
export function normalizeEans(
  values: readonly (string | number | null | undefined)[],
): string[] | undefined {
  const eans = [
    ...new Set(values.map((v) => String(v ?? '').trim()).filter((v) => EAN_PATTERN.test(v))),
  ];
  return eans.length > 0 ? eans : undefined;
}

/** `{ eans }` for spreading into an offer, or nothing when there are no barcodes. */
export function withEans(eans: string[] | undefined): { eans?: string[] } {
  return eans ? { eans } : {};
}

/** Offers without a known end date are dropped this long after they were last seen. */
const UNDATED_OFFER_LIFETIME_DAYS = 7;
/** Keep dated offers briefly past validTo so a late refresh doesn't show an empty store. */
const EXPIRY_GRACE_HOURS = 24;

/**
 * What an adapter returns: one normalized offer. `store`, `scrapedAt`, `searchText`,
 * `expiresAt` and a missing `discountPercent` are filled in by `finalizeOffer`.
 */
export const scrapedOfferSchema = z
  .object({
    /** Stable id from the store (product/offer id), unique per store. Used for upserts. */
    externalId: z.string().min(1),
    productName: z.string().trim().min(1),
    brand: z.string().trim().min(1).optional(),
    category: z.enum(CATEGORY_IDS),
    sourceCategory: z.string().trim().min(1).optional(),
    /** Offer price in EUR (per item, when `condition` is met). */
    price: z.number().positive(),
    /** Regular price in EUR, if the store publishes it. */
    regularPrice: z.number().positive().optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    /** Price per kg, l or piece at the offer price. */
    unitPrice: z
      .object({ amount: z.number().positive(), unit: z.enum(UNIT_PRICE_UNITS) })
      .optional(),
    condition: z
      .object({ kind: z.enum(CONDITION_KINDS), text: z.string().trim().min(1) })
      .optional(),
    validFrom: z.date().optional(),
    validTo: z.date().optional(),
    imageUrl: z.url().optional(),
    sourceUrl: z.url().optional(),
    /**
     * Not on sale: the product's everyday price from the store's full online catalogue
     * (Mercator, Spar), so searches can compare prices. Absent for discounts.
     */
    regular: z.literal(true).optional(),
    /** EAN/GTIN barcodes, where the store publishes them (Mercator, Spar, Tuš). */
    eans: z.array(z.string().regex(EAN_PATTERN)).min(1).optional(),
  })
  .refine((o) => o.regularPrice === undefined || o.regularPrice >= o.price, {
    message: 'regularPrice must be >= price',
    path: ['regularPrice'],
  })
  .refine((o) => !o.validFrom || !o.validTo || o.validFrom <= o.validTo, {
    message: 'validFrom must be <= validTo',
    path: ['validTo'],
  });

export type ScrapedOffer = z.infer<typeof scrapedOfferSchema>;

export type Offer = ScrapedOffer & {
  store: StoreId;
  scrapedAt: Date;
  /** Lowercase, diacritic-free name + brand + category, for the basic search mode. */
  searchText: string;
  /** When the TTL index deletes the offer. */
  expiresAt: Date;
  /** Set after each refresh for offers that have a twin (see domain/grouping.ts). */
  groupKey?: string;
};

/** Lowercases and strips diacritics: "Pralni PRAŠEK Đumbir" -> "pralni prasek dumbir". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeDiscountPercent(price: number, regularPrice: number): number {
  return Math.round((1 - price / regularPrice) * 100);
}

export function finalizeOffer(
  store: Offer['store'],
  scraped: ScrapedOffer,
  scrapedAt: Date,
): Offer {
  const discountPercent =
    scraped.discountPercent ??
    (scraped.regularPrice === undefined
      ? undefined
      : computeDiscountPercent(scraped.price, scraped.regularPrice));

  const expiresAt = scraped.validTo
    ? new Date(scraped.validTo.getTime() + EXPIRY_GRACE_HOURS * 3_600_000)
    : new Date(scrapedAt.getTime() + UNDATED_OFFER_LIFETIME_DAYS * 86_400_000);

  return {
    ...scraped,
    ...(discountPercent !== undefined && { discountPercent }),
    store,
    scrapedAt,
    searchText: normalizeSearchText(
      [scraped.productName, scraped.brand, scraped.sourceCategory].filter(Boolean).join(' '),
    ),
    expiresAt,
  };
}
