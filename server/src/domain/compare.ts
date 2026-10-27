import { normalizeSearchText, type UnitPriceUnit } from './offer.js';
import type { StoreId } from './stores.js';

/**
 * Price comparison by product type ("maslo", "sladka smetana"): not the same product, but the
 * same kind of thing, compared per kg, l or piece.
 *
 * Store names put the type first ("Maslo, Mercator, 250 g", "Jajca M iz hlevske reje",
 * "Trajno mleko, 1,5 %"); other products mention it only after a preposition ("Margarina z
 * maslom", "Keksi s čokolado") or in a later part of the name ("Skyr, … arašidovo maslo"). So a
 * product matches when every search word starts a word in the first part of its name (before the
 * first comma), before any preposition. Words that still slip through (e.g. "arašidovo maslo",
 * "kislo mleko") are left out with `exclude`.
 */

/** Words after which the rest of the name describes something else ("z maslom", "brez sladkorja"). */
const PREPOSITIONS = new Set([
  'z',
  's',
  'za',
  'v',
  'iz',
  'brez',
  'na',
  'ob',
  'po',
  'pri',
  'od',
  'do',
  'k',
  'h',
  'pod',
  'nad',
  'ali',
  'in',
  'with',
  'mit',
]);

/** Splits normalized text into words (letters and digits). */
function words(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A type word, and whether it is a capitalized name inside the phrase ("Alpsko", "Premium"). */
interface TypeWord {
  word: string;
  properName: boolean;
}

function typeWordsWithCase(productName: string): TypeWord[] {
  const head = productName.split(',')[0] ?? productName;
  const result: TypeWord[] = [];
  for (const raw of head.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const word = words(raw).join('');
    if (!word) continue;
    if (PREPOSITIONS.has(word)) break;
    // The first word is always capitalized; later capitals mark brand or product-line names.
    const properName = result.length > 0 && /^\p{Lu}\p{Ll}/u.test(raw);
    result.push({ word, properName });
  }
  return result;
}

/** The words that name the product type: the first part of the name, up to a preposition. */
export function typeWords(productName: string): string[] {
  return typeWordsWithCase(productName).map((w) => w.word);
}

export interface TypeQuery {
  /** Search words, e.g. "sladka smetana". */
  text: string;
  /** Word beginnings that rule a product out anywhere in its name, e.g. ["arasidov"]. */
  exclude?: readonly string[];
}

/**
 * A search word matches a name word that starts with it and has at most two more letters, for
 * Slovenian endings ("jogurt" ~ "jogurti"), but not a longer derived word ("riž" ≠ "riževa").
 */
function sameWord(word: string, term: string): boolean {
  return word.startsWith(term) && word.length - term.length <= 2;
}

export function matchesProductType(productName: string, query: TypeQuery): boolean {
  const terms = words(query.text);
  if (terms.length === 0) return false;
  const head = typeWords(productName);
  if (!terms.every((term) => head.some((word) => sameWord(word, term)))) return false;
  const all = words(productName);
  const exclude = (query.exclude ?? []).flatMap(words);
  return !exclude.some((ex) => all.some((word) => word.startsWith(ex)));
}

/** Word counts over many product names: single type words and adjacent pairs ("sladka smetana"). */
export type TypeWordCounts = Map<string, number>;

/** Words that never name a product type: too short, with digits (sizes), or units. */
function isTypeCandidate(word: string): boolean {
  return word.length >= 3 && !/\d/.test(word) && !UNIT_WORDS.has(word);
}

const UNIT_WORDS = new Set(['kos', 'kosov', 'kom', 'pak', 'ml', 'cl', 'kg', 'mm', 'bio', 'eko']);

/** The type words worth counting: no proper names, sizes, units or very short words. */
function candidateWords(productName: string, brand?: string): string[] {
  const brandWords = new Set(brand ? words(brand) : []);
  return typeWordsWithCase(productName)
    .filter((w) => !w.properName && isTypeCandidate(w.word) && !brandWords.has(w.word))
    .map((w) => w.word);
}

/** Counts each name's type words once, and each adjacent pair of them, for `deriveTypeQuery`. */
export function countTypeWords(names: Iterable<string>): TypeWordCounts {
  const counts: TypeWordCounts = new Map();
  for (const name of names) {
    const words = candidateWords(name);
    const keys = new Set(words);
    for (let i = 1; i < words.length; i++) keys.add(`${words[i - 1]} ${words[i]}`);
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Common Slovenian adjective endings (after diacritics are removed): "elektricni",
 * "polnozrnati", "slovensko", "trajno", "polnomastno", "surovo".
 */
const ADJECTIVE_ENDING = /(?:ni|ti|ski|sko|ska|ji|tno|jno|sno|zno|mno|vno|cno|eno|ovo|evo)$/;
/** A pair is the type ("sladka smetana") when it is common and a good share of the main word. */
const PAIR_MIN_COUNT = 3;
const PAIR_MIN_SHARE = 0.25;

/**
 * Guesses what kind of product a name is, as a comparison query, from how common its type words
 * are among similar products (`counts`, e.g. from the same category): "Slovensko surovo maslo"
 * gives "maslo". Words with adjective endings count half; on a tie the later word wins, as the
 * noun usually follows its adjectives. Capitalized names ("Alpsko", "Premium") and the brand
 * never count. A common adjective in front is kept ("sladka smetana", not all "smetana").
 */
export function deriveTypeQuery(
  productName: string,
  brand: string | undefined,
  counts: TypeWordCounts,
): string | undefined {
  const candidates = candidateWords(productName, brand);
  const scores = candidates.map((word) => {
    const count = counts.get(word) ?? 0;
    return ADJECTIVE_ENDING.test(word) ? count / 2 : count;
  });
  const top = Math.max(0, ...scores);
  const index = scores.lastIndexOf(top);
  const word = candidates[index];
  if (!word) return undefined;

  const before = candidates[index - 1];
  const pair = before && `${before} ${word}`;
  const pairCount = pair ? (counts.get(pair) ?? 0) : 0;
  if (
    pair &&
    pairCount >= PAIR_MIN_COUNT &&
    pairCount >= (counts.get(word) ?? 0) * PAIR_MIN_SHARE
  ) {
    return pair;
  }
  return word;
}

/** What the comparison needs from an offer. */
export interface Comparable {
  id: string;
  store: StoreId;
  productName: string;
  price: number;
  unitPrice?: { amount: number; unit: UnitPriceUnit } | undefined;
}

export interface StoreBest<T extends Comparable> {
  store: StoreId;
  /** The store's cheapest matching product per unit. */
  cheapest: T & { unitPrice: { amount: number; unit: UnitPriceUnit } };
  /** Matching products of this store in the comparison. */
  count: number;
}

export interface Comparison<T extends Comparable> {
  /** The unit prices are compared in (the one most matches use); undefined without matches. */
  unit?: UnitPriceUnit;
  /** One row per store, cheapest first. */
  stores: StoreBest<T>[];
  /** Every compared product, cheapest per unit first. */
  items: (T & { unitPrice: { amount: number; unit: UnitPriceUnit } })[];
  /** Matches left out because they have no unit price or use another unit (e.g. per piece). */
  notComparable: number;
}

type WithUnit<T> = T & { unitPrice: { amount: number; unit: UnitPriceUnit } };

/**
 * Compares matching offers per unit. `skip` are offer ids the user removed by hand. A product
 * listed twice by one store (same name and price) counts once.
 */
export function compareByType<T extends Comparable>(
  offers: readonly T[],
  query: TypeQuery & { skip?: readonly string[] },
): Comparison<T> {
  const skip = new Set(query.skip ?? []);
  const seen = new Set<string>();
  const matches = offers.filter((offer) => {
    if (skip.has(offer.id) || !matchesProductType(offer.productName, query)) return false;
    const key = `${offer.store}|${normalizeSearchText(offer.productName)}|${offer.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const unitCounts = new Map<UnitPriceUnit, number>();
  for (const offer of matches) {
    if (offer.unitPrice) {
      unitCounts.set(offer.unitPrice.unit, (unitCounts.get(offer.unitPrice.unit) ?? 0) + 1);
    }
  }
  const unit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const items = matches
    .filter((offer): offer is WithUnit<T> => offer.unitPrice?.unit === unit)
    .sort((a, b) => a.unitPrice.amount - b.unitPrice.amount || a.price - b.price);

  const stores = new Map<StoreId, StoreBest<T>>();
  for (const item of items) {
    const row = stores.get(item.store);
    if (row) row.count++;
    else stores.set(item.store, { store: item.store, cheapest: item, count: 1 });
  }

  return {
    ...(unit && { unit }),
    stores: [...stores.values()],
    items,
    notComparable: matches.length - items.length,
  };
}
