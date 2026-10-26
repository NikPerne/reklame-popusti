import { z } from 'zod';

/**
 * The product search result Hofer's Nuxt pages embed (payload → pinia.search.searchResult).
 * Prices are in cents. Only the fields we use are declared.
 */
export const hoferProductSchema = z.looseObject({
  sku: z.string().min(1),
  name: z.string(),
  brandName: z.string().nullish(),
  urlSlugText: z.string().nullish(),
  /** e.g. "500 g" */
  sellingSize: z.string().nullish(),
  /** "YYYY-MM-DD", the day the offer starts in stores. */
  onSaleDate: z.string().nullish(),
  price: z.looseObject({
    amountRelevant: z.number(),
    /** e.g. "1,90 €/1 kg" */
    comparisonDisplay: z.string().nullish(),
    /** e.g. "2,49 €"; almost always empty. */
    wasPriceDisplay: z.string().nullish(),
  }),
  categories: z.array(z.looseObject({ name: z.string() })).nullish(),
  assets: z.array(z.looseObject({ url: z.string(), assetType: z.string().nullish() })).nullish(),
});

export const hoferSearchResultSchema = z.looseObject({
  data: z.array(z.unknown()),
  meta: z.looseObject({
    pagination: z.looseObject({ offset: z.number(), limit: z.number(), totalCount: z.number() }),
  }),
});

export const hoferPayloadSchema = z.looseObject({
  pinia: z.looseObject({
    search: z.looseObject({ searchResult: hoferSearchResultSchema }),
  }),
});

export type HoferProduct = z.infer<typeof hoferProductSchema>;
export type HoferSearchResult = z.infer<typeof hoferSearchResultSchema>;
