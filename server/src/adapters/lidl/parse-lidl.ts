import type { CategoryId } from '../../domain/categories.js';
import { guessCategory } from '../../domain/categorize.js';
import type { ScrapedOffer } from '../../domain/offer.js';
import { attributeValues } from '../../lib/html.js';
import { toTitleCase } from '../../lib/text.js';
import { parseUnitPriceText } from '../../lib/unit-price.js';
import { lidlProductSchema, type LidlPrice, type LidlProduct } from './lidl-api.js';

export const LIDL_BASE_URL = 'https://www.lidl.si';

/** Offer pages are /c/<slug>/a<id>; /c/<slug>/s<id> are content pages. */
const OFFER_PAGE_PATTERN = /href="(?:https:\/\/www\.lidl\.si)?(\/c\/[a-z0-9-]+\/a\d+)/g;

/** Offer page paths linked from the homepage, without duplicates. */
export function findLidlOfferPages(homepageHtml: string): string[] {
  return [...new Set([...homepageHtml.matchAll(OFFER_PAGE_PATTERN)].map((m) => m[1] ?? ''))].filter(
    Boolean,
  );
}

export interface LidlPageProducts {
  products: LidlProduct[];
  /** Grid entries that didn't match the expected shape (a sign the page changed). */
  invalid: number;
}

/** Product JSON from an offer page's `data-grid-data` attributes. */
export function extractLidlProducts(pageHtml: string): LidlPageProducts {
  const products: LidlProduct[] = [];
  let invalid = 0;
  for (const value of attributeValues(pageHtml, 'data-grid-data')) {
    let data: unknown;
    try {
      data = JSON.parse(value);
    } catch {
      invalid++;
      continue;
    }
    for (const item of Array.isArray(data) ? data : [data]) {
      const parsed = lidlProductSchema.safeParse(item);
      if (parsed.success) products.push(parsed.data);
      else invalid++;
    }
  }
  return { products, invalid };
}

/** Lidl's own category plus the page topic (e.g. "otroske-igrace-lupilu") decide ours. */
function categoryFor(product: LidlProduct, pageSlug: string): CategoryId {
  const text = `${product.fullTitle ?? product.title} ${pageSlug.replace(/-/g, ' ')}`;
  switch (product.category) {
    case 'F+V':
      return 'sadje-zelenjava';
    case 'P+F':
      return 'dom-vrt';
    case 'Food':
      // Lidl files some drugstore and household items under Food too (WC blocks, face care).
      return guessCategory(product.fullTitle ?? product.title, 'any', 'shramba');
    case 'NonFood':
      return guessCategory(text, 'nonfood', 'drugo');
    default:
      return guessCategory(text, 'any', 'drugo');
  }
}

interface ChosenPrice {
  price: LidlPrice;
  lidlPlus: boolean;
}

/** The Lidl Plus price if there is one (the owner has the card), otherwise the normal price. */
function choosePrice(product: LidlProduct): ChosenPrice | undefined {
  const region = Object.values(product.regionsPrices ?? {})[0];
  const lidlPlus = region?.currentLidlPlusPrice?.price;
  if (lidlPlus?.price) return { price: lidlPlus, lidlPlus: true };
  const regular = region?.currentPrice;
  if (regular?.price) return { price: regular, lidlPlus: false };
  return undefined;
}

const fromUnixSeconds = (seconds: number | undefined) =>
  seconds === undefined ? undefined : new Date(seconds * 1000);
const fromIso = (value: string | undefined) => (value ? new Date(value) : undefined);

/**
 * Converts one product into an offer. Returns undefined for products without a price and for
 * offers whose in-store period has already ended (old pages stay online for a while).
 */
export function parseLidlProduct(
  product: LidlProduct,
  pageSlug: string,
  now: Date,
): ScrapedOffer | undefined {
  const chosen = choosePrice(product);
  if (!chosen?.price.price) return undefined;
  const { price } = chosen;
  const offerPrice = price.price as number;

  const validFrom = fromUnixSeconds(product.storeStartDate) ?? fromIso(price.startDate);
  const validTo = fromUnixSeconds(product.storeEndDate) ?? fromIso(price.endDate);
  if (validTo && validTo < now) return undefined;

  const regular = price.discount?.deletedPrice ?? price.oldPrice;
  const unitPrice = parseUnitPriceText(price.basePrice?.text);
  const packaging = price.packaging?.text?.trim();
  // Lidl uses "-" and "---" for "no brand".
  const brandName = product.brand?.name?.trim();
  const brand = brandName && /\p{L}/u.test(brandName) ? brandName : undefined;
  const title = product.title.replace(/\s+/g, ' ').trim();
  const path = product.canonicalPath ?? product.canonicalUrl;

  return {
    externalId: product.erpNumber ?? product.productId,
    // Lidl titles leave out the size; add it so "Šunka" becomes "Šunka, 200 g".
    // Only real sizes ("500 g"), not "kos", "par" or "kompl.".
    productName:
      packaging && /\d/.test(packaging) && !title.includes(packaging)
        ? `${title}, ${packaging}`
        : title,
    ...(brand && { brand: toTitleCase(brand) }),
    category: categoryFor(product, pageSlug),
    ...(product.category && { sourceCategory: product.category }),
    price: offerPrice,
    ...(regular !== undefined && regular > offerPrice && { regularPrice: regular }),
    ...(price.discount?.percentageDiscount && {
      discountPercent: price.discount.percentageDiscount,
    }),
    ...(unitPrice && { unitPrice }),
    ...(chosen.lidlPlus && { condition: { kind: 'loyalty-card' as const, text: 'Lidl Plus' } }),
    ...(validFrom && { validFrom }),
    ...(validTo && { validTo }),
    ...(product.image && { imageUrl: product.image }),
    ...(path && { sourceUrl: new URL(path, LIDL_BASE_URL).toString() }),
  };
}
