import type { CategoryId } from '../../domain/categories.js';
import { guessCategory } from '../../domain/categorize.js';
import { normalizeSearchText, type ScrapedOffer } from '../../domain/offer.js';
import { extractNuxtData } from '../../lib/nuxt-data.js';
import { parseDecimal, toTitleCase } from '../../lib/text.js';
import { fromStoreLocalTime } from '../../lib/time.js';
import { parseUnitPriceText } from '../../lib/unit-price.js';
import {
  hoferPayloadSchema,
  hoferProductSchema,
  type HoferProduct,
  type HoferSearchResult,
} from './hofer-api.js';

export const HOFER_BASE_URL = 'https://www.hofer.si';
/** "Pregled posebne ponudbe": all current special offers. */
export const HOFER_OFFERS_PATH = '/izdelki/pregled-posebne-ponudbe/k/1588161418378530';
const IMAGE_WIDTH = 400;

/** Hofer's category names (normalized) → ours. Seasonal and mixed categories are guessed. */
const CATEGORY_MAP: Record<string, CategoryId> = {
  'alkoholne pijace': 'pijace',
  'brezalkoholne pijace': 'pijace',
  cistila: 'gospodinjstvo',
  'delavnica in orodje': 'dom-vrt',
  elektronika: 'tehnika',
  'izdelki za dom in gospodinjstvo': 'gospodinjstvo',
  'konzervirana hrana in pripravljeni obroki': 'shramba',
  'meso, mesni izdelki in ribe': 'meso-ribe',
  'mleko, mlecni izdelki in jajca': 'mlecni-izdelki',
  'oblacila, obutev in modni dodatki': 'oblacila',
  'omake, olja, kis in zacimbe': 'shramba',
  'osebna nega': 'drogerija',
  'otroska prehrana in nega': 'otroci',
  'pekovski izdelki, namazi in kosmici': 'kruh-pekovsko',
  'prehranska dopolnila': 'drogerija',
  'roze in rezano cvetje': 'dom-vrt',
  'sadje in zelenjava': 'sadje-zelenjava',
  'sladki in slani prigrizki': 'sladko-slano',
  'sladoledi in sorbeti': 'zamrznjeno',
  'testenine, riz in strocnice': 'shramba',
  'vrt in okolica': 'dom-vrt',
  'vse za peko': 'shramba',
  'za male zivali': 'zivali',
  'zamrznjeni izdelki': 'zamrznjeno',
  'avto/moto': 'dom-vrt',
};

export function mapHoferCategory(product: HoferProduct): CategoryId {
  for (const category of product.categories ?? []) {
    const mapped = CATEGORY_MAP[normalizeSearchText(category.name)];
    if (mapped) return mapped;
  }
  return guessCategory(product.name, 'any', 'drugo');
}

export interface HoferPage {
  products: HoferProduct[];
  invalid: number;
  totalCount: number;
  pageSize: number;
}

/** Products and pagination from one Hofer listing page. Throws if the page shape changed. */
export function extractHoferPage(html: string): HoferPage {
  const payload = hoferPayloadSchema.parse(extractNuxtData(html));
  const result: HoferSearchResult = payload.pinia.search.searchResult;
  const products: HoferProduct[] = [];
  let invalid = 0;
  for (const item of result.data) {
    const parsed = hoferProductSchema.safeParse(item);
    if (parsed.success) products.push(parsed.data);
    else invalid++;
  }
  return {
    products,
    invalid,
    totalCount: result.meta.pagination.totalCount,
    pageSize: result.meta.pagination.limit,
  };
}

function parseOnSaleDate(value: string | null | undefined): Date | undefined {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return m ? fromStoreLocalTime(Number(m[1]), Number(m[2]), Number(m[3])) : undefined;
}

function imageUrl(product: HoferProduct): string | undefined {
  const asset = product.assets?.find((a) => a.assetType === 'FR01') ?? product.assets?.[0];
  if (!asset) return undefined;
  return asset.url
    .replace('{width}', String(IMAGE_WIDTH))
    .replace('{slug}', product.urlSlugText ?? 'image');
}

/**
 * Converts one Hofer special offer. Hofer publishes the offer price and the day it goes on sale,
 * but (almost never) a regular price, so most offers have no discount percentage.
 */
export function parseHoferProduct(product: HoferProduct): ScrapedOffer | undefined {
  const price = product.price.amountRelevant / 100;
  if (!(price > 0)) return undefined;

  const regular = parseDecimal(product.price.wasPriceDisplay?.replace(/[^\d,.]/g, ''));
  const unitPrice = parseUnitPriceText(product.price.comparisonDisplay);
  const validFrom = parseOnSaleDate(product.onSaleDate);
  const size = product.sellingSize?.trim();
  const brand = product.brandName?.trim();
  const image = imageUrl(product);

  return {
    externalId: product.sku,
    productName: size && !product.name.includes(size) ? `${product.name}, ${size}` : product.name,
    ...(brand && { brand: toTitleCase(brand) }),
    category: mapHoferCategory(product),
    ...(product.categories?.[0] && { sourceCategory: product.categories[0].name }),
    price,
    ...(regular !== undefined && regular > price && { regularPrice: regular }),
    ...(unitPrice && { unitPrice }),
    ...(validFrom && { validFrom }),
    ...(image && { imageUrl: image }),
    ...(product.urlSlugText && {
      sourceUrl: `${HOFER_BASE_URL}/izdelek/${product.urlSlugText}-${product.sku}`,
    }),
  };
}
