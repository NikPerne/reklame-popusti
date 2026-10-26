import { Schema, model } from 'mongoose';
import { CATEGORY_IDS } from '../domain/categories.js';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings.js';
import { STORE_IDS } from '../domain/stores.js';

export interface SettingsRepository {
  get(): Promise<Settings>;
  /** Saves unless the stored settings are newer; returns what is stored afterwards. */
  save(settings: Settings): Promise<Settings>;
}

/** There is one user, so one document. */
const DOCUMENT_ID = 'owner';

const settingsSchema = new Schema<Settings & { _id: string }>(
  {
    _id: { type: String, required: true },
    preferredStores: [{ type: String, enum: STORE_IDS }],
    hiddenCategories: [{ type: String, enum: CATEGORY_IDS }],
    updatedAt: { type: Date, required: true },
  },
  { collection: 'settings', versionKey: false },
);

const SettingsModel = model<Settings & { _id: string }>('Settings', settingsSchema);

export class MongoSettingsRepository implements SettingsRepository {
  async get(): Promise<Settings> {
    const doc = await SettingsModel.findById(DOCUMENT_ID, { _id: 0 }).lean<Settings>();
    return doc ?? DEFAULT_SETTINGS;
  }

  async save(settings: Settings): Promise<Settings> {
    const current = await this.get();
    if (current.updatedAt > settings.updatedAt) return current;
    await SettingsModel.replaceOne(
      { _id: DOCUMENT_ID },
      { _id: DOCUMENT_ID, ...settings },
      { upsert: true },
    );
    return settings;
  }
}
