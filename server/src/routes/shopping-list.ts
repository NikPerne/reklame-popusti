import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { listMembership } from '../domain/account.js';
import { MAX_SHOPPING_ITEMS, shoppingItemSchema } from '../domain/shopping-list.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { ShoppingListRepository } from '../repositories/shopping-list-repository.js';

const idParamsSchema = z.object({ id: z.string().min(1).max(100) });

/**
 * The shopping list, synced between devices and shared by the accounts grouped in SHARED_LISTS.
 * All writes are idempotent (safe to retry).
 */
export const shoppingListRoutes: FastifyPluginAsync<{
  shoppingList: ShoppingListRepository;
  sharedLists: string[][];
}> = async (app, { shoppingList, sharedLists }) => {
  const membership = (request: FastifyRequest) => listMembership(request.user, sharedLists);

  app.get('/api/shopping-list', async (request) => {
    const { listId, sharedWith } = membership(request);
    return { items: await shoppingList.list(listId), sharedWith };
  });

  app.put('/api/shopping-list/items/:id', async (request, reply) => {
    const { listId } = membership(request);
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    const item = parseOrBadRequest(shoppingItemSchema, request.body);
    if (item.id !== id) return reply.badRequest('Item id does not match the URL');
    if (
      (await shoppingList.count(listId)) >= MAX_SHOPPING_ITEMS &&
      !(await shoppingList.has(listId, id))
    ) {
      return reply.badRequest(`The list is limited to ${MAX_SHOPPING_ITEMS} items`);
    }
    return { result: await shoppingList.save(listId, item) };
  });

  app.delete('/api/shopping-list/items/:id', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    await shoppingList.remove(membership(request).listId, id);
    return reply.code(204).send();
  });

  app.post('/api/shopping-list/clear-checked', async (request) => ({
    removed: await shoppingList.removeChecked(membership(request).listId),
  }));
};
