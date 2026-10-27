import { z } from 'zod';

/**
 * Response of mercatoronline.si `/products/browseProducts/getProducts`, the JSON endpoint behind
 * the online shop's product grid. Only the fields we use are declared; the rest pass through.
 */
const numberLike = z.union([z.number(), z.string()]);

export const mercatorDiscountSchema = z.looseObject({
  marker_code: z.string(),
  group_type: z.string(),
  /** e.g. "-38" for a 38 % price cut; often empty. */
  value: z.string().nullish(),
  /** "YYYYMMDDhhmmss", Ljubljana local time. */
  valid_from: z.string(),
  valid_to: z.string(),
  discount_price: numberLike.nullish(),
  coupon: z.string().nullish(),
  hover_text: z.string().nullish(),
});

export const mercatorProductSchema = z.looseObject({
  itemId: z.union([z.string(), z.number()]).transform(String),
  url: z.string(),
  mainImageSrc: z.string().nullish(),
  total: z.number().optional(),
  data: z.looseObject({
    name: z.string(),
    brand_name: z.string().nullish(),
    /** Regular price; 0 when the product isn't reduced. */
    normal_price: numberLike,
    /** Shelf price; already reduced for straight price cuts. */
    current_price: numberLike,
    /** Price per unit at `current_price`. */
    price_per_unit: numberLike.nullish(),
    /** "1kg", "1l" or "kos". */
    price_per_unit_base: z.string().nullish(),
    category1: z.string().nullish(),
    category2: z.string().nullish(),
    category3: z.string().nullish(),
    discounts: z.array(mercatorDiscountSchema),
    gtins: z.array(z.looseObject({ gtin: z.string() })).nullish(),
  }),
});

export const mercatorProductsResponseSchema = z.looseObject({
  products: z.array(mercatorProductSchema),
});

/** The page envelope only; entries are checked one by one (the grid mixes in other tiles). */
export const mercatorPageSchema = z.looseObject({ products: z.array(z.unknown()) });

/** Splits a page into valid products and the number of entries that aren't products. */
export function readMercatorPage(body: unknown): { products: MercatorProduct[]; skipped: number } {
  const products: MercatorProduct[] = [];
  let skipped = 0;
  for (const entry of mercatorPageSchema.parse(body).products) {
    const parsed = mercatorProductSchema.safeParse(entry);
    if (parsed.success) products.push(parsed.data);
    else skipped++;
  }
  return { products, skipped };
}

export type MercatorDiscount = z.infer<typeof mercatorDiscountSchema>;
export type MercatorProduct = z.infer<typeof mercatorProductSchema>;
export type MercatorProductsResponse = z.infer<typeof mercatorProductsResponseSchema>;
