import * as cheerio from 'cheerio';
import type { CategoryId } from '../../domain/categories.js';
import { guessCategory } from '../../domain/categorize.js';
import { normalizeSearchText, type ScrapedOffer } from '../../domain/offer.js';
import { parseDecimal, toSentenceCase, toTitleCase } from '../../lib/text.js';
import { fromStoreLocalTime } from '../../lib/time.js';
import { parseUnitPriceText } from '../../lib/unit-price.js';

export const EUROSPIN_OFFERS_URL = 'https://www.eurospin.si/akcije/';

type CategoryRule = CategoryId | { guess: 'food' | 'nonfood' | 'any'; fallback: CategoryId };

/** Eurospin's offer categories (normalized) → ours. Broad ones are refined by the product name. */
const CATEGORY_MAP: Record<string, CategoryRule> = {
  'alkoholne pijace': 'pijace',
  'artikli spot - nezivilski': { guess: 'nonfood', fallback: 'drugo' },
  'detergenti-izdelki za dom': 'gospodinjstvo',
  'gastronomija-pripravljene jedi': { guess: 'food', fallback: 'shramba' },
  'izdelki za zajtrk in keksi': { guess: 'food', fallback: 'sladko-slano' },
  'izdelki za zivali': 'zivali',
  'kava/caj/pripravki': 'shramba',
  'konzerve zelenjava/sadje': 'shramba',
  'kuhinja, dom in osebna nega': { guess: 'any', fallback: 'gospodinjstvo' },
  'mlecni izdelki': 'mlecni-izdelki',
  'mlecni izdelki uvt in jajca': 'mlecni-izdelki',
  'narezki in svezi izdelki': { guess: 'food', fallback: 'meso-ribe' },
  'olja/kis/zabele': 'shramba',
  'otroska hrana': 'otroci',
  'papir/plastika/razno': 'gospodinjstvo',
  'parfumi-os. higiena': 'drogerija',
  'prigrizki-slani/sladki': 'sladko-slano',
  'ribe in meso v konzervi': 'shramba',
  'slascice in cokolade': 'sladko-slano',
  'sol/sladkor/moke': 'shramba',
  'suho sadje': 'sladko-slano',
  'sveze mleko': 'mlecni-izdelki',
  'sveze/polnjene testenine': 'shramba',
  'testenine in riz': 'shramba',
  'voda, pijace in sokovi': 'pijace',
  'zamrznjeni izdelki': 'zamrznjeno',
};

export interface EurospinCategoryLink {
  name: string;
  url: string;
}

/** The category filter links on the offers page (?category_filter=...). */
export function findEurospinCategories(html: string): EurospinCategoryLink[] {
  const $ = cheerio.load(html);
  const links = new Map<string, EurospinCategoryLink>();
  $('a[href*="category_filter="]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const url = new URL(href, EUROSPIN_OFFERS_URL);
    const name = url.searchParams.get('category_filter');
    if (name && url.pathname === '/akcije/') links.set(name, { name, url: url.toString() });
  });
  return [...links.values()];
}

/** Our category for a product, from Eurospin's category (if known) and the product name. */
export function mapEurospinCategory(
  categoryName: string | undefined,
  productName: string,
): CategoryId {
  const rule = categoryName ? CATEGORY_MAP[normalizeSearchText(categoryName)] : undefined;
  if (typeof rule === 'string') return rule;
  if (rule) return guessCategory(productName, rule.guess, rule.fallback);
  // Not in any category (e.g. fresh fruit and vegetables).
  return guessCategory(productName, 'any', 'drugo');
}

/** The id Eurospin uses for a card (its article number, else title and dates). */
export function eurospinCardId(card: EurospinCard): string {
  return articleNumber(card.image) ?? `${card.title}|${card.dates ?? ''}`;
}

/** One product card on the offers page, as text. */
export interface EurospinCard {
  title: string;
  brand?: string;
  /** "22.10 - 28.10" */
  dates?: string;
  /** Old price, when the card shows one ("1,35"). */
  oldPrice?: string;
  /** "1,05 €" */
  price?: string;
  /** "150 g - za kg 7,00 €" */
  info?: string;
  image?: string;
}

// \s also matches the non-breaking spaces Eurospin uses.
const clean = (text: string | undefined) => text?.replace(/\s+/g, ' ').trim() || undefined;

/** Reads the product cards (schema.org Product markup) from the offers page. */
export function extractEurospinCards(html: string): EurospinCard[] {
  const $ = cheerio.load(html);
  return $('.sn_promo_grid_item')
    .toArray()
    .map((element) => {
      const card = $(element);
      const priceBox = card.find('.i_price').first();
      // The old price is the price box's own text, before the <span> with the new price.
      const oldPrice = clean(priceBox.clone().children().remove().end().text());
      return {
        title: clean(card.find('.i_title').first().text()) ?? '',
        ...optional('brand', clean(card.find('.i_brand').first().text())),
        ...optional('dates', clean(card.find('.date_current_promo').first().text())),
        ...optional('oldPrice', oldPrice),
        ...optional('price', clean(priceBox.find('[itemprop=price]').first().text())),
        ...optional('info', clean(card.find('.i_price_info').first().text())),
        ...optional('image', card.find('img.i_image').first().attr('src')),
      };
    })
    .filter((card) => card.title !== '');
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Record<K, string>) : {};
}

/**
 * "22.10 - 28.10" without a year: the year is the one that puts the start date closest to
 * `now` (so a December run reading "29.12 - 4.1" gets the right years).
 */
export function parseEurospinDates(
  text: string | undefined,
  now: Date,
): { validFrom: Date; validTo: Date } | undefined {
  const m = text ? /(\d{1,2})\.(\d{1,2})\.?\s*-\s*(\d{1,2})\.(\d{1,2})/.exec(text) : null;
  if (!m) return undefined;
  const [fromDay, fromMonth, toDay, toMonth] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
  ];

  const year = now.getUTCFullYear();
  const candidates = [year - 1, year, year + 1].map((y) =>
    fromStoreLocalTime(y, fromMonth, fromDay),
  );
  const validFrom = candidates.reduce((best, d) =>
    Math.abs(d.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime()) ? d : best,
  );
  const fromYear = Number(
    new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Ljubljana' }).format(
      validFrom,
    ),
  );
  const toYear = toMonth < fromMonth ? fromYear + 1 : fromYear;
  // The offer runs until the end of the last day.
  const validTo = new Date(fromStoreLocalTime(toYear, toMonth, toDay + 1).getTime() - 1000);
  return { validFrom, validTo };
}

/** Eurospin's article number is the image file name: .../smt/11371001.jpg */
function articleNumber(image: string | undefined): string | undefined {
  return image ? /\/(\d{5,})\.(?:jpe?g|png|webp)$/i.exec(image)?.[1] : undefined;
}

export function parseEurospinCard(
  card: EurospinCard,
  now: Date,
  categoryName?: string,
): ScrapedOffer | undefined {
  const price = parseDecimal(card.price?.replace(/[^\d,.]/g, ''));
  if (!price || price <= 0) return undefined;

  const dates = parseEurospinDates(card.dates, now);
  if (dates && dates.validTo < now) return undefined;

  const oldPrice = parseDecimal(card.oldPrice?.replace(/[^\d,.]/g, ''));
  // "150 g - za kg 7,00 €" → size "150 g", unit price per kg
  const [size, unitText] = (card.info ?? '').split(/\s+-\s+/);
  const unitPrice = parseUnitPriceText(unitText ?? card.info);
  const name = toSentenceCase(card.title);

  return {
    externalId: eurospinCardId(card),
    productName: size && /\d/.test(size) && !/za\s/.test(size) ? `${name}, ${size}` : name,
    ...(card.brand && { brand: toTitleCase(card.brand) }),
    category: mapEurospinCategory(categoryName, name),
    ...(categoryName && { sourceCategory: toSentenceCase(categoryName) }),
    price,
    ...(oldPrice !== undefined && oldPrice > price && { regularPrice: oldPrice }),
    ...(unitPrice && { unitPrice }),
    ...(dates && dates),
    ...(card.image && { imageUrl: card.image }),
    sourceUrl: EUROSPIN_OFFERS_URL,
  };
}
