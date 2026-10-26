import { Schema, model } from 'mongoose';
import { CATEGORY_IDS } from '../domain/categories.js';
import { CONDITION_KINDS, UNIT_PRICE_UNITS, type Offer } from '../domain/offer.js';
import { STORE_IDS } from '../domain/stores.js';
import type { StoreStatus } from '../repositories/offer-repository.js';

const offerSchema = new Schema<Offer>(
  {
    store: { type: String, enum: STORE_IDS, required: true },
    externalId: { type: String, required: true },
    productName: { type: String, required: true },
    brand: String,
    category: { type: String, enum: CATEGORY_IDS, required: true },
    sourceCategory: String,
    price: { type: Number, required: true },
    regularPrice: Number,
    discountPercent: Number,
    unitPrice: {
      _id: false,
      type: { amount: Number, unit: { type: String, enum: UNIT_PRICE_UNITS } },
    },
    condition: {
      _id: false,
      type: { kind: { type: String, enum: CONDITION_KINDS }, text: String },
    },
    validFrom: Date,
    validTo: Date,
    imageUrl: String,
    sourceUrl: String,
    eans: { type: [String], default: undefined },
    scrapedAt: { type: Date, required: true },
    searchText: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'offers', versionKey: false },
);

offerSchema.index({ store: 1, externalId: 1 }, { unique: true });
offerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
offerSchema.index({ category: 1, discountPercent: -1 });
offerSchema.index({ store: 1, discountPercent: -1 });
offerSchema.index({ eans: 1 }, { sparse: true });

export const OfferModel = model<Offer>('Offer', offerSchema);

const storeStatusSchema = new Schema<StoreStatus>(
  {
    store: { type: String, enum: STORE_IDS, required: true, unique: true },
    lastRunAt: { type: Date, required: true },
    ok: { type: Boolean, required: true },
    offerCount: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    error: String,
  },
  { collection: 'store_status', versionKey: false },
);

export const StoreStatusModel = model<StoreStatus>('StoreStatus', storeStatusSchema);
