import type { ScrapedOffer } from '../domain/offer.js';
import type { StoreId } from '../domain/stores.js';
import type { Logger } from '../lib/logger.js';
import type { HttpClient } from '../scraping/polite-http-client.js';

export interface AdapterContext {
  /** Polite HTTP client; adapters must not call fetch directly. */
  http: HttpClient;
  log: Logger;
  /** When the run started. */
  now: Date;
  /** The current time, for adapters whose crawl must stop at a deadline (Spar). */
  clock?: () => Date;
}

/**
 * One adapter per store. `fetchOffers` returns the store's current offers in normalized form;
 * the refresh runner validates them, fills in derived fields and stores them.
 * Throw on failure: the runner logs the error and keeps the store's previous offers.
 */
export interface StoreAdapter {
  readonly store: StoreId;
  fetchOffers(context: AdapterContext): Promise<ScrapedOffer[]>;
  /**
   * For stores whose robots.txt limits visiting hours: return false to skip this run.
   * A skipped store keeps its offers and status.
   */
  isAllowedAt?(now: Date): boolean;
}
