import type { StoreAdapter } from '../adapters/store-adapter.js';
import { finalizeOffer, scrapedOfferSchema, type Offer } from '../domain/offer.js';
import type { StoreId } from '../domain/stores.js';
import type { Logger } from '../lib/logger.js';
import type { OfferRepository } from '../repositories/offer-repository.js';
import type { HttpClient } from '../scraping/polite-http-client.js';

export interface StoreRefreshResult {
  store: StoreId;
  ok: boolean;
  offerCount: number;
  invalidCount: number;
  removedCount: number;
  durationMs: number;
  error?: string;
  /** The adapter's `isAllowedAt` said no; nothing was fetched or changed. */
  skipped?: boolean;
}

export interface RefreshSummary {
  startedAt: Date;
  finishedAt: Date;
  results: StoreRefreshResult[];
}

export interface RefreshDependencies {
  adapters: readonly StoreAdapter[];
  repository: OfferRepository;
  http: HttpClient;
  log: Logger;
  now?: () => Date;
}

/**
 * Runs every adapter in turn. A failing store is logged, recorded in its status and skipped;
 * its previous offers stay in the database. It never stops the other stores.
 */
export async function runRefresh(deps: RefreshDependencies): Promise<RefreshSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const results: StoreRefreshResult[] = [];

  for (const adapter of deps.adapters) {
    if (adapter.isAllowedAt && !adapter.isAllowedAt(startedAt)) {
      // Not a failure: the store only allows visits at certain times. Its offers stay as they are.
      deps.log.info({ store: adapter.store }, 'outside the store’s allowed time window; skipped');
      results.push({
        store: adapter.store,
        ok: true,
        skipped: true,
        offerCount: 0,
        invalidCount: 0,
        removedCount: 0,
        durationMs: 0,
      });
      continue;
    }
    results.push(await refreshStore(adapter, deps, now));
  }

  return { startedAt, finishedAt: now(), results };
}

async function refreshStore(
  adapter: StoreAdapter,
  deps: RefreshDependencies,
  now: () => Date,
): Promise<StoreRefreshResult> {
  const { store } = adapter;
  const log = deps.log;
  const runStartedAt = now();
  let invalidCount = 0;

  try {
    const scraped = await adapter.fetchOffers({ http: deps.http, log, now: runStartedAt });

    const offers: Offer[] = [];
    for (const raw of scraped) {
      const parsed = scrapedOfferSchema.safeParse(raw);
      if (parsed.success) {
        offers.push(finalizeOffer(store, parsed.data, runStartedAt));
      } else {
        invalidCount++;
        log.warn({ store, issues: parsed.error.issues, raw }, 'skipping invalid offer');
      }
    }
    if (offers.length === 0) {
      // Most likely the store changed its site; don't wipe the offers we already have.
      throw new Error(`no valid offers (${invalidCount} invalid); keeping previous offers`);
    }

    const { removed } = await deps.repository.replaceStoreOffers(store, offers, runStartedAt);
    const result: StoreRefreshResult = {
      store,
      ok: true,
      offerCount: offers.length,
      invalidCount,
      removedCount: removed,
      durationMs: now().getTime() - runStartedAt.getTime(),
    };
    log.info(result, 'store refreshed');
    await saveStatus(deps, result, runStartedAt);
    return result;
  } catch (error) {
    const result: StoreRefreshResult = {
      store,
      ok: false,
      offerCount: 0,
      invalidCount,
      removedCount: 0,
      durationMs: now().getTime() - runStartedAt.getTime(),
      error: error instanceof Error ? error.message : String(error),
    };
    log.error({ ...result, err: error }, 'store refresh failed');
    await saveStatus(deps, result, runStartedAt);
    return result;
  }
}

async function saveStatus(
  deps: RefreshDependencies,
  result: StoreRefreshResult,
  lastRunAt: Date,
): Promise<void> {
  try {
    await deps.repository.saveStoreStatus({
      store: result.store,
      lastRunAt,
      ok: result.ok,
      offerCount: result.offerCount,
      durationMs: result.durationMs,
      ...(result.error !== undefined && { error: result.error }),
    });
  } catch (error) {
    deps.log.error({ store: result.store, err: error }, 'could not save store status');
  }
}

/** Prevents overlapping runs when the refresh is triggered over HTTP. */
export class RefreshTrigger {
  private current: Promise<void> | undefined;

  constructor(
    private readonly run: () => Promise<RefreshSummary>,
    private readonly log: Logger,
  ) {}

  get running(): boolean {
    return this.current !== undefined;
  }

  /** Starts a run in the background. Returns false if one is already running. */
  start(): boolean {
    if (this.current) return false;
    this.current = this.run()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.log.error({ err: error }, 'refresh run crashed');
      })
      .finally(() => {
        this.current = undefined;
      });
    return true;
  }
}
