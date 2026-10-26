import type { CategoryId } from '../../domain/categories.js';
import {
  normalizeEans,
  normalizeSearchText,
  withEans,
  type ScrapedOffer,
  type UnitPriceUnit,
} from '../../domain/offer.js';
import { parseDecimal, roundMoney, toSentenceCase, toTitleCase } from '../../lib/text.js';
import { fromStoreLocalTime } from '../../lib/time.js';
import type { MercatorDiscount, MercatorProduct } from './mercator-api.js';

export const MERCATOR_BASE_URL = 'https://mercatoronline.si';

/** Mercator's top-level categories (`category1`), keyed by normalizeSearchText. */
const CATEGORY_MAP: Record<string, CategoryId> = {
  'mleko, jajca in mlecni izdelki': 'mlecni-izdelki',
  'meso, mesni izdelki in ribe': 'meso-ribe',
  'svez kruh in pecivo': 'kruh-pekovsko',
  'delikatesni izdelki in pripravljene jedi': 'meso-ribe',
  'zamrznjena hrana': 'zamrznjeno',
  'osnovna zivila / shramba': 'shramba',
  'vse za zajtrk': 'shramba',
  pijace: 'pijace',
  'testenine, juhe, riz in omake': 'shramba',
  'konzervirana hrana': 'shramba',
  'cokolada in drugi sladki program': 'sladko-slano',
  'slani prigrizki in aperitivi (jedi)': 'sladko-slano',
  'diabeticna, dieteticna in druga posebna prehrana': 'shramba',
  'vse za male domace zivali': 'zivali',
  'hrana tujih dezel': 'shramba',
  'sadje in zelenjava': 'sadje-zelenjava',
  'vse za otroka': 'otroci',
  'higiena in lepota': 'drogerija',
  cistila: 'gospodinjstvo',
  'prosti cas': 'dom-vrt',
  'vse za dom in gospodinjstvo': 'gospodinjstvo',
  'oblacila in dodatki': 'oblacila',
  'vse za solo in pisarno, darilni program': 'drugo',
  sezona: 'drugo',
  'ekoloska zivila': 'shramba',
};

const UNIT_MAP: Record<string, UnitPriceUnit> = { '1kg': 'kg', '1l': 'l', kos: 'piece' };

/** Marker for "Za imetnike Pika kartice N % ceneje". */
const PIKA_DISCOUNT_MARKER = '104';
const MULTI_BUY_PATTERN = /ob nakupu (\d+) izdelkov ali več je vsak (\d+(?:[.,]\d+)?)\s*% ceneje/i;

export function mapMercatorCategory(category1: string | null | undefined): CategoryId {
  return (category1 && CATEGORY_MAP[normalizeSearchText(category1)]) || 'drugo';
}

/** "20261025002837" (Ljubljana local time) -> Date */
export function parseMercatorDate(value: string): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return fromStoreLocalTime(year, month, day, hour, minute, second);
}

interface Deal {
  price: number;
  regularPrice: number;
  discount: MercatorDiscount | undefined;
  condition?: ScrapedOffer['condition'];
}

/** All the ways this product is cheaper than usual; the caller keeps the cheapest. */
function findDeals(product: MercatorProduct, current: number): Deal[] {
  const deals: Deal[] = [];
  const { discounts } = product.data;
  const normal = parseDecimal(product.data.normal_price) ?? 0;

  // Straight price cut ("Znižano", "Ugodno", Pika price): the shelf price is already reduced.
  if (normal > current) {
    const pika = discounts.find((d) => d.marker_code === PIKA_DISCOUNT_MARKER);
    const reason = pika ?? discounts.find((d) => d.value?.startsWith('-')) ?? discounts[0];
    deals.push({
      price: current,
      regularPrice: normal,
      discount: reason,
      ...(pika && { condition: { kind: 'loyalty-card', text: 'Pika kartica' } }),
      ...(!pika && reason?.coupon && { condition: { kind: 'coupon', text: 'S kuponom' } }),
    });
  }

  // "Ob nakupu 2 izdelkov ali več je vsak 25 % ceneje."
  for (const discount of discounts) {
    const match = MULTI_BUY_PATTERN.exec(discount.hover_text ?? '');
    const percent = parseDecimal(match?.[2]);
    if (!match || percent === undefined || percent <= 0 || percent >= 100) continue;
    deals.push({
      price: roundMoney(current * (1 - percent / 100)),
      regularPrice: current,
      discount,
      condition: { kind: 'multi-buy', text: `Ob nakupu ${match[1]} ali več` },
    });
  }

  return deals;
}

/**
 * Converts one product from the API into an offer, or undefined if it isn't actually cheaper.
 * `now` is the scrape time: some discounts carry an end date in the past although the shop still
 * shows the reduced price, so such end dates are dropped rather than hiding a live offer.
 */
export function parseMercatorProduct(
  product: MercatorProduct,
  now: Date,
): ScrapedOffer | undefined {
  const current = parseDecimal(product.data.current_price);
  if (current === undefined || current <= 0) return undefined;

  const deal = findDeals(product, current).sort((a, b) => a.price - b.price)[0];
  if (!deal) return undefined;

  const { data } = product;
  const unit = data.price_per_unit_base ? UNIT_MAP[data.price_per_unit_base] : undefined;
  const perUnit = parseDecimal(data.price_per_unit);
  const validFrom = deal.discount && parseMercatorDate(deal.discount.valid_from);
  const statedValidTo = deal.discount && parseMercatorDate(deal.discount.valid_to);
  const validTo = statedValidTo && statedValidTo > now ? statedValidTo : undefined;
  const sourceCategory = [data.category1, data.category2, data.category3]
    .filter((c): c is string => Boolean(c?.trim()))
    .map(toSentenceCase)
    .join(' / ');

  return {
    externalId: product.itemId,
    productName: data.name.trim(),
    ...(data.brand_name?.trim() && { brand: toTitleCase(data.brand_name) }),
    category: mapMercatorCategory(data.category1),
    ...(sourceCategory && { sourceCategory }),
    price: deal.price,
    regularPrice: deal.regularPrice,
    ...(unit &&
      perUnit &&
      perUnit > 0 && {
        // The API's unit price is for the shelf price; scale it to the deal price.
        unitPrice: { amount: Math.round(((perUnit * deal.price) / current) * 1000) / 1000, unit },
      }),
    ...(deal.condition && { condition: deal.condition }),
    ...(validFrom && { validFrom }),
    ...(validTo && { validTo }),
    ...(product.mainImageSrc && { imageUrl: product.mainImageSrc }),
    sourceUrl: new URL(product.url, MERCATOR_BASE_URL).toString(),
    ...withEans(normalizeEans((data.gtins ?? []).map((g) => g.gtin))),
  };
}

export function parseMercatorProducts(products: MercatorProduct[], now: Date): ScrapedOffer[] {
  return products.flatMap((product) => parseMercatorProduct(product, now) ?? []);
}
