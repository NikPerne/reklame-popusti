import { Schema, model } from 'mongoose';
import { CATEGORY_IDS } from '../domain/categories.js';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings.js';
import { STORE_IDS } from '../domain/stores.js';

/** Each user's settings, keyed by user id. */
export interface SettingsRepository {
  get(userId: string): Promise<Settings>;
  /** Saves unless the stored settings are newer; returns what is stored afterwards. */
  save(userId: string, settings: Settings): Promise<Settings>;
}

const settingsSchema = new Schema<Settings & { _id: string }>(
  {
    _id: { type: String, required: true },
    preferredStores: [{ type: String, enum: STORE_IDS }],
    hiddenCategories: [{ type: String, enum: CATEGORY_IDS }],
    updatedAt: { type: Date, required: true },
  },
  { collection: 'user_settings', versionKey: false },
);

const SettingsModel = model<Settings & { _id: string }>('Settings', settingsSchema);

export class MongoSettingsRepository implements SettingsRepository {
  async get(userId: string): Promise<Settings> {
    const doc = await SettingsModel.findById(userId, { _id: 0 }).lean<Settings>();
    return doc ?? DEFAULT_SETTINGS;
  }

  async save(userId: string, settings: Settings): Promise<Settings> {
    const current = await this.get(userId);
    if (current.updatedAt > settings.updatedAt) return current;
    await SettingsModel.replaceOne({ _id: userId }, { _id: userId, ...settings }, { upsert: true });
    return settings;
  }
}
