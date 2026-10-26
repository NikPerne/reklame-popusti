import type { ScrapedOffer } from '../../domain/offer.js';
import type { AdapterContext, StoreAdapter } from '../store-adapter.js';
import {
  EUROSPIN_OFFERS_URL,
  eurospinCardId,
  extractEurospinCards,
  findEurospinCategories,
  parseEurospinCard,
} from './parse-eurospin.js';

/** Safety stop; the page links 26 categories today. */
const MAX_CATEGORIES = 40;

/**
 * Eurospin: the offers page lists every offer (about 390). The cards carry no category, so the
 * category filter pages (?category_filter=...) are read too, to learn each product's category.
 */
export const eurospinAdapter: StoreAdapter = {
  store: 'eurospin',

  async fetchOffers({ http, log, now }: AdapterContext): Promise<ScrapedOffer[]> {
    const mainPage = await http.fetchText(EUROSPIN_OFFERS_URL);
    const cards = extractEurospinCards(mainPage);
    if (cards.length === 0) throw new Error('no product cards on the offers page');

    const categoryOf = new Map<string, string>();
    let failedCategories = 0;
    for (const category of findEurospinCategories(mainPage).slice(0, MAX_CATEGORIES)) {
      try {
        for (const card of extractEurospinCards(await http.fetchText(category.url))) {
          if (!categoryOf.has(eurospinCardId(card)))
            categoryOf.set(eurospinCardId(card), category.name);
        }
      } catch (error) {
        // Without the category page those products just get a guessed category.
        failedCategories++;
        log.warn(
          { store: 'eurospin', category: category.name, err: error },
          'category page failed',
        );
      }
    }

    const offers = new Map<string, ScrapedOffer>();
    for (const card of cards) {
      const offer = parseEurospinCard(card, now, categoryOf.get(eurospinCardId(card)));
      if (offer && !offers.has(offer.externalId)) offers.set(offer.externalId, offer);
    }
    log.info(
      {
        store: 'eurospin',
        cards: cards.length,
        categorized: categoryOf.size,
        failedCategories,
        offers: offers.size,
      },
      'parsed offers page',
    );
    return [...offers.values()];
  },
};
