import { Schema, model } from 'mongoose';
import { CONDITION_KINDS, UNIT_PRICE_UNITS } from '../domain/offer.js';
import type { ShoppingItem } from '../domain/shopping-list.js';
import { STORE_IDS } from '../domain/stores.js';

export type SaveResult = 'saved' | 'stale';

/** Persistence for the (single user's) shopping list. */
export interface ShoppingListRepository {
  list(): Promise<ShoppingItem[]>;
  count(): Promise<number>;
  /** Inserts or replaces the item, unless the stored copy is newer ("stale"). */
  save(item: ShoppingItem): Promise<SaveResult>;
  remove(id: string): Promise<void>;
  removeChecked(): Promise<number>;
}

type ShoppingDoc = Omit<ShoppingItem, 'id'> & { _id: string };

const shoppingItemSchema = new Schema<ShoppingDoc>(
  {
    _id: { type: String, required: true },
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
  { collection: 'shopping_list', versionKey: false },
);

const ShoppingItemModel = model<ShoppingDoc>('ShoppingItem', shoppingItemSchema);

const toItem = ({ _id, ...rest }: ShoppingDoc): ShoppingItem => ({ id: _id, ...rest });

export class MongoShoppingListRepository implements ShoppingListRepository {
  async list(): Promise<ShoppingItem[]> {
    const docs = await ShoppingItemModel.find()
      .sort({ store: 1, productName: 1 })
      .lean<ShoppingDoc[]>();
    return docs.map(toItem);
  }

  async count(): Promise<number> {
    return ShoppingItemModel.countDocuments();
  }

  async save({ id, ...item }: ShoppingItem): Promise<SaveResult> {
    // Only replace a copy that is not newer than this one (offline edits sync late).
    const result = await ShoppingItemModel.replaceOne(
      { _id: id, updatedAt: { $lte: item.updatedAt } },
      { _id: id, ...item },
    );
    if (result.matchedCount > 0) return 'saved';
    try {
      await ShoppingItemModel.create({ _id: id, ...item });
      return 'saved';
    } catch (error) {
      // Duplicate key: the item exists with a newer updatedAt.
      if ((error as { code?: number }).code === 11000) return 'stale';
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await ShoppingItemModel.deleteOne({ _id: id });
  }

  async removeChecked(): Promise<number> {
    const { deletedCount } = await ShoppingItemModel.deleteMany({ checked: true });
    return deletedCount;
  }
}
