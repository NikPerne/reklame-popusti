import { flyerSchema, type Flyer } from '../domain/flyer.js';
import type { StoreId } from '../domain/stores.js';
import type { FlyerSource } from '../flyers/flyer-sources.js';
import type { Logger } from '../lib/logger.js';
import type { FlyerRepository } from '../repositories/flyer-repository.js';
import type { HttpClient } from '../scraping/polite-http-client.js';

export interface FlyerRefreshDependencies {
  sources: readonly FlyerSource[];
  repository: FlyerRepository;
  http: HttpClient;
  log: Logger;
  now?: () => Date;
}

export interface FlyerRefreshResult {
  store: StoreId;
  ok: boolean;
  count: number;
  error?: string;
}

/**
 * Reads every store's flyer list and replaces its flyers. A store that fails (or returns
 * nothing valid) keeps its previous flyers; flyers are a convenience, so this never fails
 * the refresh run.
 */
export async function refreshFlyers(deps: FlyerRefreshDependencies): Promise<FlyerRefreshResult[]> {
  const now = (deps.now ?? (() => new Date()))();
  const results: FlyerRefreshResult[] = [];

  for (const source of deps.sources) {
    const { store } = source;
    try {
      const flyers: Flyer[] = [];
      for (const raw of await source.fetchFlyers({ http: deps.http, log: deps.log, now })) {
        const parsed = flyerSchema.safeParse(raw);
        if (parsed.success) flyers.push(parsed.data);
        else deps.log.warn({ store, issues: parsed.error.issues, raw }, 'skipping invalid flyer');
      }
      if (flyers.length === 0) throw new Error('no valid flyers; keeping the previous ones');
      await deps.repository.replaceStore(store, flyers);
      deps.log.info({ store, flyers: flyers.length }, 'flyers refreshed');
      results.push({ store, ok: true, count: flyers.length });
    } catch (error) {
      deps.log.error({ store, err: error }, 'flyer refresh failed');
      results.push({
        store,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
