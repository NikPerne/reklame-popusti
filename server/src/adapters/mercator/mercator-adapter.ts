import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import { mercatorProductsResponseSchema, type MercatorProduct } from './mercator-api.js';
import { MERCATOR_BASE_URL, parseMercatorProducts } from './parse-mercator.js';

const PAGE_SIZE = 80;
/** Safety stop: about 3,600 discounted products today need 45 pages. */
const MAX_PAGES = 100;

/**
 * Discount markers the shop's own "Akcije" page filters on: action discounts, "gratis" and
 * Pika card discounts. Taken from `discountMarkerIds` on https://mercatoronline.si/brskaj/akcije.
 */
const DISCOUNT_MARKERS = [
  1, 2, 3, 4, 5, 6, 10, 11, 15, 16, 18, 100, 103, 109, 113, 114, 115, 126, 101, 108, 110, 111, 104,
  105, 106, 112,
].join(',');

export function mercatorPageUrl(page: number): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    // The grid sends the page index as `offset` and the item index as `from`.
    offset: String(page),
    from: String(page * PAGE_SIZE),
    'filterData[discounts]': DISCOUNT_MARKERS,
  });
  return `${MERCATOR_BASE_URL}/products/browseProducts/getProducts?${params.toString()}`;
}

/**
 * Mercator: the online shop's product-grid JSON endpoint, filtered to discounted products.
 * robots.txt allows everything; pages are fetched one after another through the polite client.
 */
export const mercatorAdapter: StoreAdapter = {
  store: 'mercator',

  async fetchOffers({ http, log, now }: AdapterContext): Promise<ScrapedOffer[]> {
    const products = new Map<string, MercatorProduct>();

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await http.fetchJson(mercatorPageUrl(page), {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      });
      const { products: batch } = mercatorProductsResponseSchema.parse(body);
      for (const product of batch) products.set(product.itemId, product);

      const total = batch[0]?.total;
      log.debug({ store: 'mercator', page, received: batch.length, total }, 'fetched page');
      if (batch.length < PAGE_SIZE || (total !== undefined && products.size >= total)) break;
      if (page === MAX_PAGES - 1) {
        log.warn({ store: 'mercator', pages: MAX_PAGES }, 'stopped at page limit');
      }
    }

    const offers = parseMercatorProducts([...products.values()], now);
    log.info(
      { store: 'mercator', products: products.size, offers: offers.length },
      'parsed products',
    );
    return offers;
  },
};
