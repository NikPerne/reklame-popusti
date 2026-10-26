import { Schema, model } from 'mongoose';
import { CONDITION_KINDS, UNIT_PRICE_UNITS } from '../domain/offer.js';
import type { ShoppingItem } from '../domain/shopping-list.js';
import { STORE_IDS } from '../domain/stores.js';

export type SaveResult = 'saved' | 'stale';

/**
 * Persistence for shopping lists. A list is identified by `listId` (one user's, or one shared by
 * several accounts); item ids are only unique within a list.
 */
export interface ShoppingListRepository {
  list(listId: string): Promise<ShoppingItem[]>;
  has(listId: string, id: string): Promise<boolean>;
  count(listId: string): Promise<number>;
  /** Inserts or replaces the item, unless the stored copy is newer ("stale"). */
  save(listId: string, item: ShoppingItem): Promise<SaveResult>;
  remove(listId: string, id: string): Promise<void>;
  removeChecked(listId: string): Promise<number>;
}

/** `_id` is `${listId}/${id}`, so the same offer can be on several lists. */
type ShoppingDoc = Omit<ShoppingItem, 'id'> & { _id: string; listId: string; itemId: string };

const shoppingItemSchema = new Schema<ShoppingDoc>(
  {
    _id: { type: String, required: true },
    listId: { type: String, required: true, index: true },
    itemId: { type: String, required: true },
    store: { type: String, enum: STORE_IDS, required: true },
    productName: { type: String, required: true },
    price: { type: Number, required: true },
    regularPrice: Number,
    unitPrice: {
      _id: false,
      type: { amount: Number, unit: { type: String, enum: UNIT_PRICE_UNITS } },
    },
    condition: {
      _id: false,
      type: { kind: { type: String, enum: CONDITION_KINDS }, text: String },
    },
    imageUrl: String,
    sourceUrl: String,
    validTo: Date,
    checked: { type: Boolean, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'shopping_items', versionKey: false },
);

const ShoppingItemModel = model<ShoppingDoc>('ShoppingItem', shoppingItemSchema);

const docId = (listId: string, id: string) => `${listId}/${id}`;

const toItem = ({ _id, listId: _l, itemId, ...rest }: ShoppingDoc): ShoppingItem => ({
  id: itemId,
  ...rest,
});

export class MongoShoppingListRepository implements ShoppingListRepository {
  async list(listId: string): Promise<ShoppingItem[]> {
    const docs = await ShoppingItemModel.find({ listId })
      .sort({ store: 1, productName: 1 })
      .lean<ShoppingDoc[]>();
    return docs.map(toItem);
  }

  async has(listId: string, id: string): Promise<boolean> {
    return (await ShoppingItemModel.exists({ _id: docId(listId, id) })) !== null;
  }

  async count(listId: string): Promise<number> {
    return ShoppingItemModel.countDocuments({ listId });
  }

  async save(listId: string, { id, ...item }: ShoppingItem): Promise<SaveResult> {
    const doc = { _id: docId(listId, id), listId, itemId: id, ...item };
    // Only replace a copy that is not newer than this one (offline edits sync late).
    const result = await ShoppingItemModel.replaceOne(
      { _id: doc._id, updatedAt: { $lte: item.updatedAt } },
      doc,
    );
    if (result.matchedCount > 0) return 'saved';
    try {
      await ShoppingItemModel.create(doc);
      return 'saved';
    } catch (error) {
      // Duplicate key: the item exists with a newer updatedAt.
      if ((error as { code?: number }).code === 11000) return 'stale';
      throw error;
    }
  }

  async remove(listId: string, id: string): Promise<void> {
    await ShoppingItemModel.deleteOne({ _id: docId(listId, id) });
  }

  async removeChecked(listId: string): Promise<number> {
    const { deletedCount } = await ShoppingItemModel.deleteMany({ listId, checked: true });
    return deletedCount;
  }
}
