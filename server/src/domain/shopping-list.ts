import { z } from 'zod';
import { CONDITION_KINDS, UNIT_PRICE_UNITS } from './offer.js';
import { STORE_IDS } from './stores.js';

/**
 * One shopping-list entry. It keeps a copy of the offer (name, price, store, ...), so the list
 * stays readable after the offer has expired and been removed.
 */
export const shoppingItemSchema = z.object({
  /** The offer id; adding the same offer twice is the same item. */
  id: z.string().min(1).max(100),
  store: z.enum(STORE_IDS),
  productName: z.string().trim().min(1).max(300),
  price: z.number().positive(),
  regularPrice: z.number().positive().optional(),
  unitPrice: z.object({ amount: z.number().positive(), unit: z.enum(UNIT_PRICE_UNITS) }).optional(),
  condition: z
    .object({ kind: z.enum(CONDITION_KINDS), text: z.string().trim().min(1).max(200) })
    .optional(),
  imageUrl: z.url().optional(),
  sourceUrl: z.url().optional(),
  validTo: z.coerce.date().optional(),
  checked: z.boolean(),
  /** Set by the client when the item changes; an older write never replaces a newer one. */
  updatedAt: z.coerce.date(),
});

export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/** Upper bound so a bug can't fill the database. */
export const MAX_SHOPPING_ITEMS = 500;
