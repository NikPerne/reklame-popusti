import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import {
  SPAR_BASE_URL,
  extractSparPageCount,
  extractSparProducts,
  parseSparProduct,
} from './parse-spar.js';

/** Offer categories in Spar's online shop: "Iz letaka" (flyer) and "Akcije, dom in prosti čas". */
export const SPAR_FLYER_PATHS = [
  '/ca/aktualno/iz-letaka/S17/S17-1',
  '/ca/aktualno/akcije-dom-in-prosti-cas/S17/S17-2',
];

/**
 * The rest of the catalogue: every top-level category from https://online.spar.si/sitemap-categories.xml
 * except S17 ("Aktualno"), about 20,500 products (2026-10-27).
 */
export const SPAR_CATALOGUE_PATHS = [
  '/ca/sadje-in-zelenjava/S1',
  '/ca/hlajeni-in-mlecni-izdelki/S2',
  '/ca/sveze-meso-mesni-izdelki-in-ribe/S3',
  '/ca/vse-za-zajtrk/S4',
  '/ca/pijace/S5',
  '/ca/kruh-pecivo-in-slascice/S6',
  '/ca/shramba/S7',
  '/ca/bio-in-druga-posebna-hrana/S8',
  '/ca/zamrznjeni-izdelki/S9',
  '/ca/sladki-in-slani-prigrizki/S10',
  '/ca/vse-za-otroka/S11',
  '/ca/vse-za-male-zivali/S12',
  '/ca/osebna-nega/S13',
  '/ca/izdelki-za-dom/S14',
  '/ca/kuhinja/S15',
  '/ca/gospodinjski-aparati/S16',
  '/ca/elektronika/S18',
  '/ca/vrt-in-prosti-cas/S19',
];

const PAGE_SIZE = 50;
/** The largest category ("Shramba", about 3,000 products) has about 60 pages. */
const MAX_PAGES_PER_CATEGORY = 100;
/** spar.si's robots.txt asks for 10 s between requests ... */
const REQUEST_DELAY_MS = 10_000;
/** ... and for visits between 04:00 and 08:45 UTC only. */
const VISIT_WINDOW_UTC = { from: 4 * 60, to: 8 * 60 + 45 };

function insideVisitWindow(now: Date): boolean {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= VISIT_WINDOW_UTC.from && minutes <= VISIT_WINDOW_UTC.to;
}

export function sparPageUrl(path: string, page: number): string {
  return `${SPAR_BASE_URL}${path}${page > 1 ? `?currentPage=${page}` : ''}`;
}

/**
 * Spar: the online shop (online.spar.si). Products are server-rendered into the Next.js flight
 * payload; each page holds 50, `?currentPage=N` gives the next ones. The offer pages come first
 * (their products count as offers even without a promotion), then the whole catalogue, whose
 * products without a promotion are kept at their everyday price (`regular`).
 * With 10 s per page this takes about 75 minutes, so it runs once a day at 04:05 UTC.
 */
export const sparAdapter: StoreAdapter = {
  store: 'spar',

  isAllowedAt: insideVisitWindow,

  async fetchOffers({ http, log, now, clock }: AdapterContext): Promise<ScrapedOffer[]> {
    const offers = new Map<string, ScrapedOffer>();
    let invalid = 0;
    let requests = 0;
    const sources = [
      ...SPAR_FLYER_PATHS.map((path) => ({ path, source: 'flyer' as const })),
      ...SPAR_CATALOGUE_PATHS.map((path) => ({ path, source: 'catalogue' as const })),
    ];

    for (const { path, source } of sources) {
      let pageCount = MAX_PAGES_PER_CATEGORY;
      let previousFirstSku: string | undefined;
      for (let page = 1; page <= Math.min(pageCount, MAX_PAGES_PER_CATEGORY); page++) {
        // Never visit outside the allowed hours. Failing keeps yesterday's offers, which is
        // better than replacing them with half a catalogue.
        if (clock && !insideVisitWindow(clock())) {
          throw new Error(`visiting hours ended after ${requests} pages; keeping previous offers`);
        }
        const html = await http.fetchText(sparPageUrl(path, page), {
          minDelayMs: REQUEST_DELAY_MS,
        });
        requests++;
        const result = extractSparProducts(html);
        invalid += result.invalid;
        if (page === 1) pageCount = extractSparPageCount(html) ?? pageCount;
        // The same page again means the shop ignored `currentPage`: stop instead of looping.
        const firstSku = result.products[0]?.sku;
        if (page > 1 && firstSku === previousFirstSku) break;
        previousFirstSku = firstSku;
        for (const product of result.products) {
          // A product on an offer page and in its category keeps the offer page's version.
          if (offers.has(product.sku)) continue;
          const offer = parseSparProduct(product, now, source);
          if (offer) offers.set(offer.externalId, offer);
        }
        // A short page is the last one.
        if (result.products.length < PAGE_SIZE) break;
      }
    }

    if (requests > 0 && offers.size === 0 && invalid > 0) {
      throw new Error(`no valid products (${invalid} invalid); the page format may have changed`);
    }
    const discounted = [...offers.values()].filter((o) => !o.regular).length;
    log.info(
      { store: 'spar', requests, invalid, products: offers.size, discounted },
      'parsed catalogue',
    );
    return [...offers.values()];
  },
};
