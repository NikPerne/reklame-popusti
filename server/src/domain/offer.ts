import { z } from 'zod';
import { CATEGORY_IDS } from './categories.js';
import { STORE_IDS } from './stores.js';

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
    /** Current (discounted) price in EUR. */
    price: z.number().positive(),
    /** Regular price in EUR, if the store publishes it. */
    regularPrice: z.number().positive().optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    unitPrice: z
      .object({ amount: z.number().positive(), unit: z.string().trim().min(1) })
      .optional(),
    validFrom: z.date().optional(),
    validTo: z.date().optional(),
    imageUrl: z.url().optional(),
    sourceUrl: z.url().optional(),
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
  store: (typeof STORE_IDS)[number];
  scrapedAt: Date;
  /** Lowercase, diacritic-free name + brand + category, for the basic search mode. */
  searchText: string;
  /** When the TTL index deletes the offer. */
  expiresAt: Date;
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
