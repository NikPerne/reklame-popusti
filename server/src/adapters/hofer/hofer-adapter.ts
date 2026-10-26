import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import {
  HOFER_BASE_URL,
  HOFER_OFFERS_PATH,
  extractHoferPage,
  parseHoferProduct,
} from './parse-hofer.js';

/** Safety stop: about 280 offers today need 5 pages of 60. */
const MAX_PAGES = 10;

export function hoferPageUrl(page: number): string {
  // robots.txt explicitly allows ?page=
  return `${HOFER_BASE_URL}${HOFER_OFFERS_PATH}${page > 1 ? `?page=${page}` : ''}`;
}

/**
 * Hofer: the "Pregled posebne ponudbe" listing (all current special offers). The pages are
 * server-rendered by Nuxt; products come from the embedded __NUXT_DATA__ payload.
 */
export const hoferAdapter: StoreAdapter = {
  store: 'hofer',

  async fetchOffers({ http, log }: AdapterContext): Promise<ScrapedOffer[]> {
    const offers = new Map<string, ScrapedOffer>();
    let invalid = 0;
    let pages = 1;

    for (let page = 1; page <= pages; page++) {
      const result = extractHoferPage(await http.fetchText(hoferPageUrl(page)));
      if (page === 1) {
        pages = Math.min(Math.ceil(result.totalCount / result.pageSize), MAX_PAGES);
        if (result.totalCount > MAX_PAGES * result.pageSize) {
          log.warn({ store: 'hofer', totalCount: result.totalCount }, 'stopped at page limit');
        }
      }
      invalid += result.invalid;
      for (const product of result.products) {
        const offer = parseHoferProduct(product);
        if (offer && !offers.has(offer.externalId)) offers.set(offer.externalId, offer);
      }
    }

    log.info({ store: 'hofer', pages, invalid, offers: offers.size }, 'parsed offer pages');
    return [...offers.values()];
  },
};
