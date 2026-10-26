import * as cheerio from 'cheerio';
import type { CategoryId } from '../../domain/categories.js';
import { guessCategory } from '../../domain/categorize.js';
import { normalizeEans, withEans, type ScrapedOffer } from '../../domain/offer.js';
import { parseDecimal, toTitleCase } from '../../lib/text.js';
import { unitPriceFromName } from '../../lib/unit-price.js';

export const TUS_BASE_URL = 'https://www.tus.si';

/** The offer lists the owner wants: the current catalogue, and Tuš klub card deals. */
export const TUS_LISTS = [
  { path: '/aktualno/akcijska-ponudba/aktualno-iz-kataloga/', clubCard: false },
  { path: '/aktualno/akcijska-ponudba/tus-klub-50/', clubCard: true },
] as const;

type CategoryRule = CategoryId | { guess: 'food' | 'any'; fallback: CategoryId };

/** Tuš main categories (the `product_cat_m-<slug>` class) → ours. Broad ones are refined. */
const CATEGORY_MAP: Record<string, CategoryRule> = {
  shramba: 'shramba',
  'hlajeni-in-mlecni-izdelki': { guess: 'food', fallback: 'mlecni-izdelki' },
  'osebna-nega': 'drogerija',
  'cvetje-in-vrt': 'dom-vrt',
  'sladko-in-slano': 'sladko-slano',
  dom: 'gospodinjstvo',
  'meso-delikatesa-in-ribe': 'meso-ribe',
  'kruh-in-pekovski-izdelki': 'kruh-pekovsko',
  'sadje-in-zelenjava': 'sadje-zelenjava',
  pijace: 'pijace',
  'brezalkoholne-pijace': 'pijace',
  'alkoholne-pijace': 'pijace',
  'male-zivali': 'zivali',
  'dojencki-in-otroci': 'otroci',
  'zamrznjeni-izdelki': 'zamrznjeno',
  zamrznjeno: 'zamrznjeno',
  'otroski-program': 'otroci',
  otroci: 'otroci',
  'hrana-za-zivali': 'zivali',
  zivali: 'zivali',
};

/** Tuš subcategories (the first `product_cat-<slug>` class), more precise than the main one. */
const SUBCATEGORY_MAP: Record<string, CategoryId> = {
  'mlecni-izdelki': 'mlecni-izdelki',
  kozmetika: 'drogerija',
  'zeleni-program': 'dom-vrt',
  sladkarije: 'sladko-slano',
  prigrizki: 'sladko-slano',
  'pranje-perila': 'gospodinjstvo',
  'vzdrzevanje-doma': 'gospodinjstvo',
  'pripravljena-konzervirana-hrana': 'shramba',
  'zita-za-zajtrk': 'shramba',
  'delikatesni-izdelki': 'meso-ribe',
  pekarna: 'kruh-pekovsko',
};

export interface TusCard {
  id: string;
  ean?: string;
  name: string;
  /** "2,09 €" */
  price?: string;
  /** "Redna cena: 2,59 €" */
  regularPrice?: string;
  discount?: string;
  url?: string;
  image?: string;
  /** Slug from the `pa_znamka-<slug>` class. */
  brandSlug?: string;
  /** Slug from the `product_cat_m-<slug>` class. */
  mainCategory?: string;
  /** Slug from the first `product_cat-<slug>` class. */
  subCategory?: string;
}

export interface TusPage {
  cards: TusCard[];
  /** Highest page number linked from this page's pagination (1 if none). */
  lastPage: number;
}

const classValue = (classes: string, prefix: string) =>
  new RegExp(`(?:^|\\s)${prefix}([a-z0-9-]+)`).exec(classes)?.[1];

export function extractTusPage(html: string): TusPage {
  const $ = cheerio.load(html);
  const cards: TusCard[] = [];
  $('li.product').each((_, element) => {
    const item = $(element);
    const classes = item.attr('class') ?? '';
    const card = item.find('.card-product').first();
    const gtm = item.find('.gtm4wp_productdata').first();
    const id = gtm.attr('data-gtm4wp_product_id') ?? card.attr('data-product-ean');
    const name = item.find('h3 a').first().text().replace(/\s+/g, ' ').trim();
    if (!id || !name) return;
    const image = item.find('img').first();
    cards.push({
      id,
      name,
      ...optional('ean', card.attr('data-product-ean')),
      ...optional('price', item.find('.price').first().text().trim()),
      ...optional('regularPrice', item.find('.price-regular-desktop').first().text().trim()),
      ...optional('discount', item.find('.discount span').first().text().trim()),
      ...optional('url', item.find('h3 a').first().attr('href')),
      ...optional('image', image.attr('data-src') ?? image.attr('src')),
      ...optional('brandSlug', classValue(classes, 'pa_znamka-')),
      ...optional('mainCategory', classValue(classes, 'product_cat_m-')),
      ...optional('subCategory', classValue(classes, 'product_cat-')),
    });
  });

  const pages = $('a[href*="/page/"]')
    .toArray()
    .map((a) => Number(/\/page\/(\d+)\//.exec($(a).attr('href') ?? '')?.[1] ?? 0));
  return { cards, lastPage: Math.max(1, ...pages) };
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Record<K, string>) : {};
}

const euros = (text: string | undefined) => parseDecimal(text?.replace(/[^\d,.]/g, ''));

export function mapTusCategory(
  mainCategory: string | undefined,
  subCategory: string | undefined,
  name: string,
): CategoryId {
  const sub = subCategory ? SUBCATEGORY_MAP[subCategory] : undefined;
  if (sub) return sub;
  const rule = mainCategory ? CATEGORY_MAP[mainCategory] : undefined;
  if (typeof rule === 'string') return rule;
  if (rule) return guessCategory(name, rule.guess, rule.fallback);
  return guessCategory(name, 'any', 'drugo');
}

/**
 * Converts one card. Tuš lists carry no validity dates, so offers are kept while they are
 * listed. Tuš klub prices get a loyalty-card condition (the owner has the card).
 */
export function parseTusCard(card: TusCard, clubCard: boolean): ScrapedOffer | undefined {
  const price = euros(card.price);
  if (!price || price <= 0) return undefined;
  const regular = euros(card.regularPrice);
  const discount = card.discount ? Number(card.discount) : undefined;
  const unitPrice = unitPriceFromName(price, card.name);
  const image = card.image?.startsWith('data:') ? undefined : card.image;

  return {
    externalId: card.id,
    productName: card.name,
    ...(card.brandSlug && { brand: toTitleCase(card.brandSlug.replace(/-/g, ' ')) }),
    category: mapTusCategory(card.mainCategory, card.subCategory, card.name),
    ...(card.mainCategory && { sourceCategory: card.mainCategory.replace(/-/g, ' ') }),
    price,
    ...(regular !== undefined && regular > price && { regularPrice: regular }),
    ...(discount !== undefined && discount > 0 && discount < 100 && { discountPercent: discount }),
    ...(unitPrice && { unitPrice }),
    ...(clubCard && { condition: { kind: 'loyalty-card' as const, text: 'Tuš klub' } }),
    ...(image && { imageUrl: new URL(image, TUS_BASE_URL).toString() }),
    ...(card.url && { sourceUrl: new URL(card.url, TUS_BASE_URL).toString() }),
    ...withEans(normalizeEans([card.ean])),
  };
}
