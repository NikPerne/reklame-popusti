import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import { SPAR_BASE_URL, extractSparProducts, parseSparProduct } from './parse-spar.js';

/** Offer categories in Spar's online shop: "Iz letaka" (flyer) and "Akcije, dom in prosti čas". */
export const SPAR_CATEGORY_PATHS = [
  '/ca/aktualno/iz-letaka/S17/S17-1',
  '/ca/aktualno/akcije-dom-in-prosti-cas/S17/S17-2',
];
const PAGE_SIZE = 50;
const MAX_PAGES_PER_CATEGORY = 20;
/** spar.si's robots.txt asks for 10 s between requests ... */
const REQUEST_DELAY_MS = 10_000;
/** ... and for visits between 04:00 and 08:45 UTC only. */
const VISIT_WINDOW_UTC = { from: 4 * 60, to: 8 * 60 + 45 };

export function sparPageUrl(path: string, page: number): string {
  return `${SPAR_BASE_URL}${path}${page > 1 ? `?currentPage=${page}` : ''}`;
}

/**
 * Spar: the online shop (online.spar.si) offer categories. Products are server-rendered into
 * the Next.js flight payload; each page holds 50, `?currentPage=N` gives the next ones.
 */
export const sparAdapter: StoreAdapter = {
  store: 'spar',

  isAllowedAt(now: Date): boolean {
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return minutes >= VISIT_WINDOW_UTC.from && minutes <= VISIT_WINDOW_UTC.to;
  },

  async fetchOffers({ http, log, now }: AdapterContext): Promise<ScrapedOffer[]> {
    const offers = new Map<string, ScrapedOffer>();
    let invalid = 0;
    let requests = 0;

    for (const path of SPAR_CATEGORY_PATHS) {
      for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
        const html = await http.fetchText(sparPageUrl(path, page), {
          minDelayMs: REQUEST_DELAY_MS,
        });
        requests++;
        const result = extractSparProducts(html);
        invalid += result.invalid;
        const before = offers.size;
        for (const product of result.products) {
          const offer = parseSparProduct(product, now);
          if (offer && !offers.has(offer.externalId)) offers.set(offer.externalId, offer);
        }
        // A short page, or one with nothing new, is the last one.
        if (result.products.length < PAGE_SIZE || offers.size === before) break;
      }
    }

    if (requests > 0 && offers.size === 0 && invalid > 0) {
      throw new Error(`no valid products (${invalid} invalid); the page format may have changed`);
    }
    log.info({ store: 'spar', requests, invalid, offers: offers.size }, 'parsed offer pages');
    return [...offers.values()];
  },
};
