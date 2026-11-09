import type { AdapterContext } from '../adapters/store-adapter.js';
import type { Flyer } from '../domain/flyer.js';
import type { StoreId } from '../domain/stores.js';
import {
  EUROSPIN_FLYER,
  HOFER_FLYER,
  LIDL_FLYERS_URL,
  MERCATOR_FLYERS_URL,
  SPAR_FLYERS_URL,
  TUS_FLYERS_URL,
  extractLidlFlyerIds,
  lidlFlyerApiUrl,
  parseLidlFlyer,
  parseMercatorFlyers,
  parseSparFlyers,
  parseTusFlyers,
  sparWeeklyFlyers,
} from './parse-flyers.js';

/** Reads one store's current flyers (list pages only; the flyers themselves are not copied). */
export interface FlyerSource {
  readonly store: StoreId;
  fetchFlyers(context: AdapterContext): Promise<Flyer[]>;
}

/** Lidl usually has 3–5 flyers; each needs one API request. */
const MAX_LIDL_FLYERS = 8;

export const flyerSources: readonly FlyerSource[] = [
  {
    store: 'mercator',
    fetchFlyers: async ({ http }) => parseMercatorFlyers(await http.fetchText(MERCATOR_FLYERS_URL)),
  },
  {
    store: 'lidl',
    async fetchFlyers({ http, log }) {
      const ids = extractLidlFlyerIds(await http.fetchText(LIDL_FLYERS_URL));
      const flyers: Flyer[] = [];
      for (const id of ids.slice(0, MAX_LIDL_FLYERS)) {
        try {
          const flyer = parseLidlFlyer(id, await http.fetchJson(lidlFlyerApiUrl(id)));
          if (flyer) flyers.push(flyer);
        } catch (error) {
          log.warn({ store: 'lidl', flyer: id, err: error }, 'could not read flyer');
        }
      }
      return flyers;
    },
  },
  { store: 'hofer', fetchFlyers: () => Promise.resolve([HOFER_FLYER]) },
  {
    store: 'spar',
    async fetchFlyers({ http, log, now }) {
      try {
        const flyers = parseSparFlyers(await http.fetchText(SPAR_FLYERS_URL));
        if (flyers.length > 0) return flyers;
      } catch (error) {
        // Cloudflare refuses the refresh's client at times; never try to get around it.
        log.info(
          { store: 'spar', err: error },
          'flyer list unavailable; using the weekly catalogues',
        );
      }
      return sparWeeklyFlyers(now);
    },
  },
  {
    store: 'tus',
    fetchFlyers: async ({ http }) => parseTusFlyers(await http.fetchText(TUS_FLYERS_URL)),
  },
  { store: 'eurospin', fetchFlyers: () => Promise.resolve([EUROSPIN_FLYER]) },
];
