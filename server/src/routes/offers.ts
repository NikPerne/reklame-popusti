import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CATEGORY_IDS } from '../domain/categories.js';
import { EAN_PATTERN } from '../domain/offer.js';
import { STORE_IDS, STORES } from '../domain/stores.js';
import { parseOrBadRequest } from '../lib/validation.js';
import {
  OFFER_SORTS,
  type OfferQuery,
  type OfferRepository,
} from '../repositories/offer-repository.js';

const MAX_PAGE_SIZE = 100;

/** "a,b" -> ["a", "b"], each checked against the allowed values. */
const commaList = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values as [T, ...T[]])).min(1));

/** `?store=lidl,dm` -> ['lidl', 'dm'] */
const storeListSchema = commaList(STORE_IDS);

const offerQuerySchema = z.object({
  q: z.string().trim().min(2).max(100).optional(),
  store: storeListSchema.optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  /** Categories the user never wants to see, e.g. `?excludeCategory=oblacila,tehnika`. */
  excludeCategory: commaList(CATEGORY_IDS).optional(),
  minDiscount: z.coerce.number().min(0).max(100).optional(),
  ean: z.string().regex(EAN_PATTERN, 'must be an 8–14 digit barcode').optional(),
  /**
   * `only` = discounts only, `all` = also everyday prices from the full catalogues. Default:
   * `all` when searching by text or barcode (to compare prices), `only` when browsing.
   */
  deals: z.enum(['only', 'all']).optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  startedWithinDays: z.coerce.number().int().min(1).max(31).optional(),
  endsWithinDays: z.coerce.number().int().min(1).max(31).optional(),
  sort: z.enum(OFFER_SORTS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});

const storeParamsSchema = z.object({ store: z.enum(STORE_IDS) });
const categoryParamsSchema = z.object({ category: z.enum(CATEGORY_IDS) });

type OfferQueryInput = z.infer<typeof offerQuerySchema>;

function toOfferQuery(input: OfferQueryInput, now: Date): OfferQuery {
  return {
    ...(input.q !== undefined && { text: input.q }),
    ...(input.store !== undefined && { stores: input.store }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.excludeCategory !== undefined && { excludeCategories: input.excludeCategory }),
    ...(input.minDiscount !== undefined && { minDiscount: input.minDiscount }),
    ...(input.ean !== undefined && { ean: input.ean }),
    onlyDeals: input.deals ? input.deals === 'only' : !input.q && !input.ean,
    ...(input.upcoming !== undefined && { upcoming: input.upcoming }),
    ...(input.startedWithinDays !== undefined && { startedWithinDays: input.startedWithinDays }),
    ...(input.endsWithinDays !== undefined && { endsWithinDays: input.endsWithinDays }),
    sort: input.sort ?? (input.q ? 'relevance' : 'discount'),
    page: input.page,
    pageSize: input.pageSize,
    now,
  };
}

export const offerRoutes: FastifyPluginAsync<{ repository: OfferRepository }> = async (
  app,
  { repository },
) => {
  /** Search and filter offers across all stores, e.g. `?q=kava&minDiscount=30&sort=price`. */
  app.get('/api/offers', async (request) => {
    const input = parseOrBadRequest(offerQuerySchema, request.query);
    const query = toOfferQuery(input, new Date());
    const page = await repository.find(query);
    return { ...page, page: query.page, pageSize: query.pageSize };
  });

  app.get('/api/stores/:store/offers', async (request) => {
    const { store } = parseOrBadRequest(storeParamsSchema, request.params);
    const input = parseOrBadRequest(offerQuerySchema.omit({ store: true }), request.query);
    const query = toOfferQuery({ ...input, store: [store] }, new Date());
    const page = await repository.find(query);
    return { ...page, page: query.page, pageSize: query.pageSize };
  });

  app.get('/api/categories/:category/offers', async (request) => {
    const { category } = parseOrBadRequest(categoryParamsSchema, request.params);
    const input = parseOrBadRequest(offerQuerySchema.omit({ category: true }), request.query);
    const query = toOfferQuery({ ...input, category }, new Date());
    const page = await repository.find(query);
    return { ...page, page: query.page, pageSize: query.pageSize };
  });

  /** Stores with the result of their last refresh. */
  app.get('/api/stores', async () => {
    const statuses = new Map((await repository.storeStatuses()).map((s) => [s.store, s]));
    return STORE_IDS.map((id) => ({ id, ...STORES[id], status: statuses.get(id) ?? null }));
  });

  /** Categories that currently have offers, with counts, for the category filter. */
  app.get('/api/categories', async () => repository.categoryCounts(new Date()));
};
