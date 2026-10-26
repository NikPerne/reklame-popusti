import type { RefreshEnv } from '../config/env.js';
import { PoliteHttpClient } from './polite-http-client.js';

export function createHttpClient(env: RefreshEnv): PoliteHttpClient {
  return new PoliteHttpClient({
    userAgent: env.SCRAPER_USER_AGENT,
    minDelayMs: env.SCRAPER_MIN_DELAY_MS,
    cacheTtlMs: env.SCRAPER_CACHE_TTL_MINUTES * 60_000,
  });
}
