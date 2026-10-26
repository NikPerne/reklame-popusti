import { z } from 'zod';

/**
 * Product data embedded in Lidl's offer pages as `data-grid-data` attributes (JSON). Only the
 * fields we use are declared; everything else passes through.
 */
export const lidlPriceSchema = z.looseObject({
  price: z.number().optional(),
  oldPrice: z.number().optional(),
  discount: z
    .looseObject({
      deletedPrice: z.number().optional(),
      percentageDiscount: z.number().optional(),
    })
    .optional(),
  /** e.g. "1 kg = 0,90" */
  basePrice: z.looseObject({ text: z.string().optional() }).optional(),
  /** e.g. "500 g" */
  packaging: z.looseObject({ text: z.string().optional() }).optional(),
  /** ISO dates of the online price, used when the in-store dates are missing. */
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const lidlProductSchema = z.looseObject({
  productId: z.union([z.number(), z.string()]).transform(String),
  /** Unique per variant (e.g. 11000079004); variants share `productId`. */
  erpNumber: z.union([z.number(), z.string()]).transform(String).optional(),
  title: z.string(),
  fullTitle: z.string().optional(),
  brand: z.looseObject({ name: z.string().optional() }).nullish(),
  /** "Food", "F+V" (fruit & vegetables), "P+F" (plants & flowers) or "NonFood". */
  category: z.string().optional(),
  image: z.string().optional(),
  canonicalPath: z.string().optional(),
  canonicalUrl: z.string().optional(),
  /** In-store offer period, Unix seconds. */
  storeStartDate: z.number().optional(),
  storeEndDate: z.number().optional(),
  regionsPrices: z
    .record(
      z.string(),
      z.looseObject({
        currentPrice: lidlPriceSchema.optional(),
        currentLidlPlusPrice: z
          .looseObject({ price: lidlPriceSchema, lidlPlusText: z.string().optional() })
          .optional(),
      }),
    )
    .optional(),
});

export type LidlPrice = z.infer<typeof lidlPriceSchema>;
export type LidlProduct = z.infer<typeof lidlProductSchema>;
