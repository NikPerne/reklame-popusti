import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MAX_SHOPPING_ITEMS, shoppingItemSchema } from '../domain/shopping-list.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { ShoppingListRepository } from '../repositories/shopping-list-repository.js';

const idParamsSchema = z.object({ id: z.string().min(1).max(100) });

/** The shopping list, synced between devices. All writes are idempotent (safe to retry). */
export const shoppingListRoutes: FastifyPluginAsync<{
  shoppingList: ShoppingListRepository;
}> = async (app, { shoppingList }) => {
  app.get('/api/shopping-list', async () => ({ items: await shoppingList.list() }));

  app.put('/api/shopping-list/items/:id', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    const item = parseOrBadRequest(shoppingItemSchema, request.body);
    if (item.id !== id) return reply.badRequest('Item id does not match the URL');
    if ((await shoppingList.count()) >= MAX_SHOPPING_ITEMS) {
      const existing = (await shoppingList.list()).some((i) => i.id === id);
      if (!existing) return reply.badRequest(`The list is limited to ${MAX_SHOPPING_ITEMS} items`);
    }
    return { result: await shoppingList.save(item) };
  });

  app.delete('/api/shopping-list/items/:id', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    await shoppingList.remove(id);
    return reply.code(204).send();
  });

  app.post('/api/shopping-list/clear-checked', async () => ({
    removed: await shoppingList.removeChecked(),
  }));
};
