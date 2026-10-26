import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import {
  LIDL_BASE_URL,
  extractLidlProducts,
  findLidlOfferPages,
  parseLidlProduct,
} from './parse-lidl.js';

/** Safety stop; the homepage links about 20–25 offer pages. */
const MAX_PAGES = 40;

/**
 * Lidl: the weekly offer pages (/c/<topic>/a<id>) linked from the homepage. Each page embeds
 * its products as JSON in `data-grid-data` attributes, including the Lidl Plus price.
 * Lidl's JSON search API requires authentication and is not used.
 */
export const lidlAdapter: StoreAdapter = {
  store: 'lidl',

  async fetchOffers({ http, log, now }: AdapterContext): Promise<ScrapedOffer[]> {
    const homepage = await http.fetchText(`${LIDL_BASE_URL}/`);
    const pages = findLidlOfferPages(homepage).slice(0, MAX_PAGES);
    if (pages.length === 0) throw new Error('no offer pages linked from the homepage');

    const offers = new Map<string, ScrapedOffer>();
    let failedPages = 0;
    let invalid = 0;

    for (const path of pages) {
      let html: string;
      try {
        html = await http.fetchText(`${LIDL_BASE_URL}${path}`);
      } catch (error) {
        // One broken page shouldn't cost the whole store.
        failedPages++;
        log.warn({ store: 'lidl', path, err: error }, 'offer page failed');
        continue;
      }
      const slug = path.split('/')[2] ?? '';
      const page = extractLidlProducts(html);
      invalid += page.invalid;
      for (const product of page.products) {
        const offer = parseLidlProduct(product, slug, now);
        if (offer && !offers.has(offer.externalId)) offers.set(offer.externalId, offer);
      }
    }

    if (failedPages === pages.length) throw new Error(`all ${pages.length} offer pages failed`);
    log.info(
      { store: 'lidl', pages: pages.length, failedPages, invalid, offers: offers.size },
      'parsed offer pages',
    );
    return [...offers.values()];
  },
};
