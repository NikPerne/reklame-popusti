import { Schema, model } from 'mongoose';
import { FLYER_VIEWERS, type Flyer, type FlyerPage } from '../domain/flyer.js';
import { STORE_IDS, type StoreId } from '../domain/stores.js';

/** A flyer in a list: without its pages, which only the viewer needs. */
export type FlyerSummary = Omit<Flyer, 'pages'> & { pageCount?: number };

/** Each store's current flyers, replaced by every refresh. */
export interface FlyerRepository {
  /** Replaces the store's flyers with these. */
  replaceStore(store: StoreId, flyers: readonly Flyer[]): Promise<void>;
  list(): Promise<FlyerSummary[]>;
  findById(id: string): Promise<Flyer | undefined>;
}

type FlyerDoc = Omit<Flyer, 'id'> & { _id: string };

const pageSchema = new Schema<FlyerPage>(
  { image: { type: String, required: true }, zoom: String, width: Number, height: Number },
  { _id: false },
);

const flyerSchema = new Schema<FlyerDoc>(
  {
    _id: { type: String, required: true },
    store: { type: String, enum: STORE_IDS, required: true },
    title: { type: String, required: true },
    validFrom: Date,
    validTo: Date,
    coverUrl: String,
    sourceUrl: { type: String, required: true },
    viewer: { type: String, enum: FLYER_VIEWERS, required: true },
    url: String,
    pages: { type: [pageSchema], default: undefined },
  },
  { collection: 'flyers', versionKey: false },
);

flyerSchema.index({ store: 1 });

export const FlyerModel = model<FlyerDoc>('Flyer', flyerSchema);

const toFlyer = ({ _id, ...rest }: FlyerDoc): Flyer => ({ id: _id, ...rest });

export class MongoFlyerRepository implements FlyerRepository {
  async replaceStore(store: StoreId, flyers: readonly Flyer[]): Promise<void> {
    if (flyers.length > 0) {
      await FlyerModel.bulkWrite(
        flyers.map(({ id, ...rest }) => ({
          replaceOne: { filter: { _id: id }, replacement: { _id: id, ...rest }, upsert: true },
        })),
        { ordered: false },
      );
    }
    await FlyerModel.deleteMany({ store, _id: { $nin: flyers.map((f) => f.id) } });
  }

  async list(): Promise<FlyerSummary[]> {
    const docs = await FlyerModel.aggregate<FlyerDoc & { pageCount: number | null }>([
      { $addFields: { pageCount: { $size: { $ifNull: ['$pages', []] } } } },
      { $project: { pages: 0 } },
    ]);
    return docs.map(({ pageCount, ...doc }) => ({
      ...toFlyer(doc),
      ...(pageCount ? { pageCount } : {}),
    }));
  }

  async findById(id: string): Promise<Flyer | undefined> {
    const doc = await FlyerModel.findById(id).lean<FlyerDoc>();
    return doc ? toFlyer(doc) : undefined;
  }
}
