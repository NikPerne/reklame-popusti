import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { summarizeHistory } from '../domain/price-history.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { OfferRepository } from '../repositories/offer-repository.js';
import type { PriceHistoryRepository } from '../repositories/price-history-repository.js';

const idParamsSchema = z.object({ id: z.string().min(1).max(100) });

export const historyRoutes: FastifyPluginAsync<{
  repository: OfferRepository;
  history: PriceHistoryRepository;
}> = async (app, { repository, history }) => {
  /** The offer's price over time in its store (product page chart). */
  app.get('/api/offers/:id/history', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    const offer = await repository.findById(id);
    if (!offer) return reply.notFound('Offer not found');
    const points = await history.find(offer.store, offer.externalId);
    return { points, summary: summarizeHistory(points) ?? null };
  });
};
