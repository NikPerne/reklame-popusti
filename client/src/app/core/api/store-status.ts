import type { StoreInfo } from './models';

/** The refresh runs once a day; more than this without success means something broke. */
export const STALE_AFTER_MS = 30 * 3_600_000;

/** Older statuses have no lastSuccessAt yet; a successful last run counts too. */
export function lastSuccess(store: StoreInfo): string | undefined {
  return store.status?.lastSuccessAt ?? (store.status?.ok ? store.status.lastRunAt : undefined);
}

/** No successful refresh in over a day (or ever): probably the store's website changed. */
export function isStale(store: StoreInfo, now = Date.now()): boolean {
  const last = lastSuccess(store);
  return !last || now - new Date(last).getTime() > STALE_AFTER_MS;
}
