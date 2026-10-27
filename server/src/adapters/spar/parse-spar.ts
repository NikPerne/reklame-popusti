import type { CategoryId } from '../../domain/categories.js';
import { guessCategory } from '../../domain/categorize.js';
import {
  normalizeEans,
  normalizeSearchText,
  withEans,
  type ScrapedOffer,
  type UnitPriceUnit,
} from '../../domain/offer.js';
import { flightObjects } from '../../lib/next-flight.js';
import { roundMoney, toSentenceCase, toTitleCase } from '../../lib/text.js';
import { sparProductSchema, type SparProduct } from './spar-api.js';

export const SPAR_BASE_URL = 'https://online.spar.si';

/** Spar's top-level categories (normalized) → ours. "Hlajeni in mlečni" also holds cold cuts. */
const CATEGORY_MAP: Record<string, CategoryId | 'guess-food'> = {
  'vse za otroka': 'otroci',
  shramba: 'shramba',
  'izdelki za dom': 'gospodinjstvo',
  'hlajeni in mlecni izdelki': 'guess-food',
  'sadje in zelenjava': 'sadje-zelenjava',
  'osebna nega': 'drogerija',
  pijace: 'pijace',
  'zamrznjeni izdelki': 'zamrznjeno',
  'sveze meso, mesni izdelki in ribe': 'meso-ribe',
  'kruh, pecivo in slascice': 'kruh-pekovsko',
  'vse za zajtrk, malico ali kosilo': 'shramba',
  'sladki in slani prigrizki': 'sladko-slano',
  'bio in druga posebna hrana': 'guess-food',
  elektronika: 'tehnika',
  'gospodinjski aparati': 'gospodinjstvo',
  'hrana in oprema za zivali': 'zivali',
  'vse za male zivali': 'zivali',
  'vse za zajtrk': 'shramba',
  kuhinja: 'gospodinjstvo',
  'vrt in prosti cas': 'dom-vrt',
};

const UNIT_MAP: Record<string, UnitPriceUnit> = { KG: 'kg', L: 'l', KOS: 'piece' };

export function extractSparProducts(html: string): { products: SparProduct[]; invalid: number } {
  const products: SparProduct[] = [];
  let invalid = 0;
  for (const object of flightObjects(html, 'CatalogProductModel')) {
    const parsed = sparProductSchema.safeParse(object);
    if (parsed.success) products.push(parsed.data);
    else invalid++;
  }
  return { products, invalid };
}

/** Number of pages in the listing, from the page's pagination data (escaped in the payload). */
export function extractSparPageCount(html: string): number | undefined {
  const match = /\\?"pagination\\?":\{\\?"page\\?":\d+,\\?"pages\\?":(\d+)/.exec(html);
  return match ? Number(match[1]) : undefined;
}

export function mapSparCategory(product: SparProduct): CategoryId {
  const name = toSentenceCase(product.name);
  for (const data of product.categoriesData ?? []) {
    const top = data.categoryNamesPath?.split('/')[1];
    if (!top || top === 'AKTUALNO') continue;
    const mapped = CATEGORY_MAP[normalizeSearchText(top)];
    if (mapped === 'guess-food') return guessCategory(name, 'food', 'mlecni-izdelki');
    if (mapped) return mapped;
  }
  return guessCategory(name, 'any', 'drugo');
}

/**
 * Converts one product. The promotion carries the offer price and its dates. Without one, a
 * product from the "Iz letaka" / "Akcije" pages (`flyer`) is a flyer item at its normal price
 * (kept, without a discount); one from the rest of the catalogue is marked `regular`.
 */
export function parseSparProduct(
  product: SparProduct,
  now: Date,
  source: 'flyer' | 'catalogue' = 'flyer',
): ScrapedOffer | undefined {
  const promotion = product.promotion?.isActive === false ? undefined : product.promotion;
  const promoPrice = promotion?.conditions?.find((c) => !c.quantity)?.price;
  const price = promoPrice ?? product.price;
  if (!(price > 0)) return undefined;

  const validTo = promotion?.endDateTime ? new Date(promotion.endDateTime) : undefined;
  if (validTo && validTo < now) return undefined;
  const validFrom = promotion?.startDateTime ? new Date(promotion.startDateTime) : undefined;

  const unit = product.subUnit ? UNIT_MAP[product.subUnit.toUpperCase()] : undefined;
  const perUnit = promoPrice ? product.promotionPricePerSubUnit : product.pricePerSubUnit;
  // "Ostalo" ("other") is Spar's placeholder for products without a brand.
  const brand =
    product.brand?.trim().toLowerCase() === 'ostalo' ? undefined : product.brand?.trim();
  const image = product.photosUrl?.[0];

  return {
    externalId: product.sku,
    productName: toSentenceCase(product.name),
    ...(brand && { brand: toTitleCase(brand) }),
    category: mapSparCategory(product),
    price,
    ...(promoPrice !== undefined && product.price > promoPrice && { regularPrice: product.price }),
    ...(promoPrice === undefined && source === 'catalogue' && { regular: true as const }),
    ...(unit && perUnit && perUnit > 0 && { unitPrice: { amount: roundMoney(perUnit), unit } }),
    ...(validFrom && { validFrom }),
    ...(validTo && { validTo }),
    ...(image && { imageUrl: image }),
    ...(product.slug && { sourceUrl: `${SPAR_BASE_URL}/p/${product.slug}` }),
    ...withEans(normalizeEans(product.ean ?? [])),
  };
}
