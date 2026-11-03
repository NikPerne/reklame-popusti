import { Schema, model, type AnyBulkWriteOperation } from 'mongoose';
import type { Offer } from '../domain/offer.js';
import {
  HISTORY_RETENTION_DAYS,
  MAX_HISTORY_POINTS,
  pricePointFor,
  samePrice,
  type PricePoint,
} from '../domain/price-history.js';
import { STORE_IDS, type StoreId } from '../domain/stores.js';

/** Each product's price over time, per store listing. Written by the refresh. */
export interface PriceHistoryRepository {
  /** Records the prices of one store's offers seen at `at`. */
  record(store: StoreId, offers: readonly Offer[], at: Date): Promise<void>;
  /** Oldest point first; empty if the product has no history. */
  find(store: StoreId, externalId: string): Promise<PricePoint[]>;
}

interface PriceHistoryDoc {
  _id: string;
  store: StoreId;
  externalId: string;
  points: PricePoint[];
  updatedAt: Date;
}

const pointSchema = new Schema<PricePoint>(
  {
    price: { type: Number, required: true },
    regularPrice: Number,
    from: { type: Date, required: true },
    to: { type: Date, required: true },
  },
  { _id: false },
);

const priceHistorySchema = new Schema<PriceHistoryDoc>(
  {
    _id: { type: String, required: true },
    store: { type: String, enum: STORE_IDS, required: true },
    externalId: { type: String, required: true },
    points: { type: [pointSchema], required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'price_history', versionKey: false },
);

priceHistorySchema.index({ store: 1 });
priceHistorySchema.index({ updatedAt: 1 }, { expireAfterSeconds: HISTORY_RETENTION_DAYS * 86_400 });

export const PriceHistoryModel = model<PriceHistoryDoc>('PriceHistory', priceHistorySchema);

const historyId = (store: StoreId, externalId: string) => `${store}/${externalId}`;

export class MongoPriceHistoryRepository implements PriceHistoryRepository {
  async record(store: StoreId, offers: readonly Offer[], at: Date): Promise<void> {
    const latest = await PriceHistoryModel.find({ store }, { points: { $slice: -1 } }).lean<
      Pick<PriceHistoryDoc, '_id' | 'points'>[]
    >();
    const lastPoint = new Map(latest.map((d) => [d._id, d.points[0]]));

    const operations: AnyBulkWriteOperation<PriceHistoryDoc>[] = [];
    for (const offer of offers) {
      const point = pricePointFor(offer, at);
      if (!point) continue;
      const _id = historyId(store, offer.externalId);
      const last = lastPoint.get(_id);
      if (last && samePrice(last, point)) {
        operations.push({
          updateOne: {
            filter: { _id },
            update: { $set: { 'points.$[last].to': at, updatedAt: at } },
            arrayFilters: [{ 'last.from': last.from }],
          },
        });
      } else {
        operations.push({
          updateOne: {
            filter: { _id },
            update: {
              $setOnInsert: { store, externalId: offer.externalId },
              $set: { updatedAt: at },
              $push: { points: { $each: [point], $slice: -MAX_HISTORY_POINTS } },
            },
            upsert: true,
          },
        });
      }
    }
    if (operations.length > 0) await PriceHistoryModel.bulkWrite(operations, { ordered: false });
  }

  async find(store: StoreId, externalId: string): Promise<PricePoint[]> {
    const doc = await PriceHistoryModel.findById(historyId(store, externalId), {
      points: 1,
    }).lean<Pick<PriceHistoryDoc, 'points'>>();
    return doc?.points ?? [];
  }
}
