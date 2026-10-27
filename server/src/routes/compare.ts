import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { CategoryId } from '../domain/categories.js';
import {
  compareByType,
  countTypeWords,
  deriveTypeQuery,
  type TypeQuery,
  type TypeWordCounts,
} from '../domain/compare.js';
import { COMPARE_PRESETS, presetFor } from '../domain/compare-presets.js';
import { STORE_IDS } from '../domain/stores.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { OfferRepository, OfferView } from '../repositories/offer-repository.js';

/** Enough for the broadest types ("jogurt" is about 250 products in Mercator alone). */
const MAX_CANDIDATES = 3000;
/** The full list on the page; the per-store rows always come from all matches. */
const MAX_ITEMS = 100;

/** Type-word counts change only with a refresh (once a day). */
const WORD_COUNTS_TTL_MS = 6 * 3_600_000;

const idParamsSchema = z.object({ id: z.string().min(1).max(100) });

const list = (max: number, itemMax: number) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(itemMax)).max(max));

const compareQuerySchema = z.object({
  q: z.string().trim().min(2).max(60),
  /** Word beginnings that rule a product out, e.g. `exclude=arasidov,kakavov`. */
  exclude: list(30, 40).optional(),
  /** Offer ids the user removed from the comparison by hand. */
  skip: list(200, 40).optional(),
  store: list(STORE_IDS.length, 20)
    .pipe(z.array(z.enum(STORE_IDS)))
    .optional(),
});

/**
 * Price comparison by product type: `GET /api/compare?q=maslo` returns each store's cheapest
 * product of that type per kg/l/piece, and all compared products (discounts and everyday prices).
 */
export const compareRoutes: FastifyPluginAsync<{ repository: OfferRepository }> = async (
  app,
  { repository },
) => {
  const compare = async (
    query: TypeQuery & { skip?: string[]; stores?: (typeof STORE_IDS)[number][] },
  ) => {
    const candidates = await repository.findCandidates({
      text: query.text,
      ...(query.stores && { stores: query.stores }),
      now: new Date(),
      limit: MAX_CANDIDATES,
    });
    const comparison = compareByType(candidates, query);
    return {
      ...comparison,
      total: comparison.items.length,
      items: comparison.items.slice(0, MAX_ITEMS),
    };
  };

  const wordCounts = new Map<CategoryId, { at: number; counts: TypeWordCounts }>();
  const countsFor = async (category: CategoryId): Promise<TypeWordCounts> => {
    const cached = wordCounts.get(category);
    if (cached && Date.now() - cached.at < WORD_COUNTS_TTL_MS) return cached.counts;
    const counts = countTypeWords(await repository.productNames(category));
    wordCounts.set(category, { at: Date.now(), counts });
    return counts;
  };

  /** What kind of product an offer is: its ready-made comparison, else a guessed type word. */
  const typeQueryFor = async (
    offer: OfferView,
  ): Promise<(TypeQuery & { presetId?: string }) | undefined> => {
    const preset = presetFor(offer.productName);
    if (preset) return { text: preset.q, exclude: preset.exclude, presetId: preset.id };
    const text = deriveTypeQuery(offer.productName, offer.brand, await countsFor(offer.category));
    return text ? { text, exclude: [] } : undefined;
  };

  app.get('/api/compare', async (request) => {
    const input = parseOrBadRequest(compareQuerySchema, request.query);
    return compare({
      text: input.q,
      ...(input.exclude && { exclude: input.exclude }),
      ...(input.skip && { skip: input.skip }),
      ...(input.store && { stores: input.store }),
    });
  });

  /** The ready-made comparisons (quick picks); labels are translated in the web app. */
  app.get('/api/compare/presets', async () => COMPARE_PRESETS);

  /**
   * One offer and products of the same type in all stores, e.g. butter for "Maslo, Mila, 250 g".
   * `query` is null when no type could be found in the name.
   */
  app.get('/api/offers/:id/related', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    const offer = await repository.findById(id);
    if (!offer) return reply.notFound('Offer not found');
    const query = await typeQueryFor(offer);
    return {
      offer,
      query: query ?? null,
      comparison: query ? await compare(query) : null,
    };
  });
};
