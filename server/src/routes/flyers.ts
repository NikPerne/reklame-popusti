import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentFlyers } from '../domain/flyer.js';
import { STORE_IDS } from '../domain/stores.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { FlyerRepository } from '../repositories/flyer-repository.js';

const idParamsSchema = z.object({ id: z.string().min(1).max(130) });

export const flyerRoutes: FastifyPluginAsync<{ flyers: FlyerRepository }> = async (
  app,
  { flyers },
) => {
  /** Flyers that have not ended, by store (in the app's store order), soonest first. */
  app.get('/api/flyers', async () => {
    // The sort is stable, so each store's flyers stay soonest first.
    return currentFlyers(await flyers.list(), new Date()).sort(
      (a, b) => STORE_IDS.indexOf(a.store) - STORE_IDS.indexOf(b.store),
    );
  });

  /** One flyer with its pages (the in-app viewer). */
  app.get('/api/flyers/:id', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    return (await flyers.findById(id)) ?? reply.notFound('Flyer not found');
  });
};
