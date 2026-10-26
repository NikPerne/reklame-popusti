import { z } from 'zod';

/**
 * Product model in Spar's online shop pages (Instaleap platform), read from the Next.js flight
 * payload (`__typename: "CatalogProductModel"`). Only the fields we use are declared.
 */
const sparPromotionSchema = z.looseObject({
  type: z.string(),
  isActive: z.boolean().nullish(),
  /** ISO dates, e.g. "2026-10-27T21:59:59.000+00:00". */
  startDateTime: z.string().nullish(),
  endDateTime: z.string().nullish(),
  conditions: z
    .array(z.looseObject({ quantity: z.number().nullish(), price: z.number() }))
    .nullish(),
});

export const sparProductSchema = z.looseObject({
  sku: z.string().min(1),
  /** Upper case, e.g. "PARADIŽNIKOVA KREMNA JUHA, PODRAVKA, 60G". */
  name: z.string(),
  brand: z.string().nullish(),
  slug: z.string().nullish(),
  /** Regular price; per kg for products sold by weight. */
  price: z.number(),
  /** "KOS" (piece), "KG", "L", ... */
  subUnit: z.string().nullish(),
  /** Unit price at the promotional price, per `subUnit`. */
  promotionPricePerSubUnit: z.number().nullish(),
  pricePerSubUnit: z.number().nullish(),
  photosUrl: z.array(z.string()).nullish(),
  promotion: sparPromotionSchema.nullish(),
  /** EAN barcodes of the product (and its pack variants). */
  ean: z.array(z.string()).nullish(),
  categoriesData: z.array(z.looseObject({ categoryNamesPath: z.string().nullish() })).nullish(),
});

export type SparProduct = z.infer<typeof sparProductSchema>;
