import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import { TUS_BASE_URL, TUS_LISTS, extractTusPage, parseTusCard } from './parse-tus.js';

/** Safety stop per list; the catalogue list has about 15 pages of 36. */
const MAX_PAGES = 30;

export function tusPageUrl(path: string, page: number): string {
  return `${TUS_BASE_URL}${path}${page > 1 ? `page/${page}/` : ''}`;
}

/**
 * Tuš: the WooCommerce offer lists "Aktualno iz kataloga" and "Tuš Klub −50 %" (36 products
 * per page, /page/N/). A product in both lists keeps its cheaper offer.
 */
export const tusAdapter: StoreAdapter = {
  store: 'tus',

  async fetchOffers({ http, log }: AdapterContext): Promise<ScrapedOffer[]> {
    const offers = new Map<string, ScrapedOffer>();
    let requests = 0;

    for (const list of TUS_LISTS) {
      let lastPage = 1;
      for (let page = 1; page <= Math.min(lastPage, MAX_PAGES); page++) {
        const result = extractTusPage(await http.fetchText(tusPageUrl(list.path, page)));
        requests++;
        if (page === 1) lastPage = result.lastPage;
        for (const card of result.cards) {
          const offer = parseTusCard(card, list.clubCard);
          const existing = offer && offers.get(offer.externalId);
          if (offer && (!existing || offer.price < existing.price)) {
            offers.set(offer.externalId, offer);
          }
        }
      }
      if (lastPage > MAX_PAGES)
        log.warn({ store: 'tus', list: list.path, lastPage }, 'stopped at page limit');
    }

    if (offers.size === 0)
      throw new Error(`no offers in ${requests} pages; the page format may have changed`);
    log.info({ store: 'tus', requests, offers: offers.size }, 'parsed offer lists');
    return [...offers.values()];
  },
};
