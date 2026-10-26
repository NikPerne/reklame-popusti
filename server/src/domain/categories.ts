/**
 * Cross-store categories. Adapters map each store's own categories onto these so the
 * category filter works across stores; the store's original label is kept as `sourceCategory`.
 * The client translates these ids into Slovenian/English labels.
 */
export const CATEGORY_IDS = [
  'sadje-zelenjava',
  'meso-ribe',
  'mlecni-izdelki',
  'kruh-pekovsko',
  'shramba',
  'sladko-slano',
  'pijace',
  'zamrznjeno',
  'drogerija',
  'gospodinjstvo',
  'otroci',
  'zivali',
  'dom-vrt',
  'tehnika',
  'oblacila',
  'drugo',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}
