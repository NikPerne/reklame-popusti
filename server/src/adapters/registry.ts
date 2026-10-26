import { hoferAdapter } from './hofer/hofer-adapter.js';
import { lidlAdapter } from './lidl/lidl-adapter.js';
import { mercatorAdapter } from './mercator/mercator-adapter.js';
import type { StoreAdapter } from './store-adapter.js';

/** Enabled store adapters. Adding a store = adding its adapter here; nothing else changes. */
export const adapters: readonly StoreAdapter[] = [mercatorAdapter, lidlAdapter, hoferAdapter];
