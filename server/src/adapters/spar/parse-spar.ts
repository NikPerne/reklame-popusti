import type { CategoryId } from '../../domain/categories.js';
import { guessCategory } from '../../domain/categorize.js';
import { normalizeSearchText, type ScrapedOffer, type UnitPriceUnit } from '../../domain/offer.js';
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
 * Converts one product from the "Iz letaka" / "Akcije" categories. The promotion carries the
 * offer price and its dates; products in those categories without a promotion are flyer items
 * at their normal price (kept, without a discount).
 */
export function parseSparProduct(product: SparProduct, now: Date): ScrapedOffer | undefined {
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
    ...(unit && perUnit && perUnit > 0 && { unitPrice: { amount: roundMoney(perUnit), unit } }),
    ...(validFrom && { validFrom }),
    ...(validTo && { validTo }),
    ...(image && { imageUrl: image }),
    ...(product.slug && { sourceUrl: `${SPAR_BASE_URL}/p/${product.slug}` }),
  };
}
