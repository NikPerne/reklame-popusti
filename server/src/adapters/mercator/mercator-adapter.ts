import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import { readMercatorPage, type MercatorProduct } from './mercator-api.js';
import { MERCATOR_BASE_URL, parseMercatorProducts } from './parse-mercator.js';

const PAGE_SIZE = 80;
/** The API returns at most 10,000 products per listing (125 pages); categories stay below it. */
const MAX_PAGES = 125;

/**
 * Top-level categories of the online shop (links `/brskaj#categories=N` on
 * https://mercatoronline.si/brskaj, 2026-10-27), about 16,800 products together. The whole
 * catalogue at once would hit the 10,000-product limit, so it is fetched category by category.
 */
export const MERCATOR_CATEGORIES = [
  14535405, 14535446, 14535463, 14535481, 14535512, 14535548, 14535588, 14535612, 14535661,
  14535681, 14535711, 14535736, 14535749, 14535768, 14535803, 14535810, 14535837, 14535864,
  14535906, 14535941, 14535984, 14536021, 14536058, 14536089, 16873196,
];

export function mercatorPageUrl(category: number, page: number): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    // The grid sends the page index as `offset` and the item index as `from`.
    offset: String(page),
    from: String(page * PAGE_SIZE),
    'filterData[categories]': String(category),
  });
  return `${MERCATOR_BASE_URL}/products/browseProducts/getProducts?${params.toString()}`;
}

/**
 * Mercator: the online shop's product-grid JSON endpoint, the whole catalogue. Discounted
 * products become offers; the rest are kept at their everyday price (`regular`).
 * robots.txt allows everything; pages are fetched one after another through the polite client.
 */
export const mercatorAdapter: StoreAdapter = {
  store: 'mercator',

  async fetchOffers({ http, log, now }: AdapterContext): Promise<ScrapedOffer[]> {
    const products = new Map<string, MercatorProduct>();
    let requests = 0;
    let skipped = 0;

    for (const category of MERCATOR_CATEGORIES) {
      let seen = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = await http.fetchJson(mercatorPageUrl(category, page), {
          headers: { 'x-requested-with': 'XMLHttpRequest' },
        });
        requests++;
        const result = readMercatorPage(body);
        const batch = result.products;
        skipped += result.skipped;
        // A product listed in two categories is kept once.
        for (const product of batch) products.set(product.itemId, product);
        const entries = batch.length + result.skipped;
        seen += entries;

        const total = batch[0]?.total;
        if (entries < PAGE_SIZE || (total !== undefined && seen >= total)) break;
        if (page === MAX_PAGES - 1) {
          log.warn({ store: 'mercator', category, pages: MAX_PAGES }, 'stopped at page limit');
        }
      }
      log.debug({ store: 'mercator', category, products: seen }, 'fetched category');
    }

    if (products.size === 0) {
      throw new Error(
        `no valid products in ${requests} pages; the response format may have changed`,
      );
    }
    const offers = parseMercatorProducts([...products.values()], now);
    log.info(
      {
        store: 'mercator',
        requests,
        skipped,
        products: products.size,
        discounted: offers.filter((o) => !o.regular).length,
      },
      'parsed catalogue',
    );
    return offers;
  },
};
