import { z } from 'zod';
import { CATEGORY_IDS } from './categories.js';
import { STORE_IDS } from './stores.js';

/** The user's preferences, shared between devices. */
export const settingsSchema = z.object({
  /** Default store filter; empty = all stores. */
  preferredStores: z.array(z.enum(STORE_IDS)).max(STORE_IDS.length),
  /** Categories never shown in results. */
  hiddenCategories: z.array(z.enum(CATEGORY_IDS)).max(CATEGORY_IDS.length),
  /** Newer settings win, as for the shopping list. */
  updatedAt: z.coerce.date(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  preferredStores: [],
  hiddenCategories: [],
  updatedAt: new Date(0),
};
