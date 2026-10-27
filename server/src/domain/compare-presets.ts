import { matchesProductType } from './compare.js';

/**
 * Ready-made comparisons. `q` and `exclude` are matched against store product names (Slovenian,
 * diacritics ignored); `exclude` lists word beginnings of other products that share the name
 * ("arašidovo maslo", "kislo mleko"). Tuned on the Mercator, Spar and offer data of 2026-10-27.
 */
export interface ComparePreset {
  /** Translation key under `compare.presets` in the web app. */
  id: string;
  q: string;
  exclude: string[];
}

export const COMPARE_PRESETS: readonly ComparePreset[] = [
  {
    id: 'butter',
    q: 'maslo',
    exclude: [
      'arasidov',
      'kakav',
      'sezamov',
      'mandljev',
      'kokosov',
      'lesnikov',
      'orescn',
      'shea',
      'telo',
      'ustnic',
      'margarin',
    ],
  },
  { id: 'cream', q: 'sladka smetana', exclude: ['sprej', 'rastlinsk'] },
  { id: 'sourCream', q: 'kisla smetana', exclude: [] },
  {
    id: 'milk',
    q: 'mleko',
    exclude: [
      'kislo',
      'cokolad',
      'kokosov',
      'ovsen',
      'sojin',
      'mandljev',
      'rizev',
      'prah',
      'kondenz',
      'vanilij',
      'jagod',
      'banan',
      'protein',
      'lesnik',
      'telo',
      'otrosk',
      'zacetn',
      'nadaljevaln',
      'cistiln',
      'odstranjev',
      'soncn',
      'obraz',
    ],
  },
  { id: 'yogurt', q: 'jogurt', exclude: ['napitek', 'sladoled', 'preliv', 'cokolad'] },
  { id: 'eggs', q: 'jajca', exclude: ['prepel', 'cokolad', 'kinder', 'velikonoc', 'barv'] },
  { id: 'flour', q: 'moka', exclude: [] },
  { id: 'sugar', q: 'sladkor', exclude: ['vanilin', 'zelirn'] },
  { id: 'sunflowerOil', q: 'soncnicno olje', exclude: [] },
  { id: 'oliveOil', q: 'oljcno olje', exclude: [] },
  { id: 'coffee', q: 'mleta kava', exclude: [] },
  {
    id: 'rice',
    q: 'riz',
    exclude: [
      'vaflj',
      'napitek',
      'mleko',
      'kosmic',
      'pokovk',
      'krekerj',
      'rezanc',
      'ploscic',
      'instant',
    ],
  },
  { id: 'spaghetti', q: 'spageti', exclude: [] },
  { id: 'bananas', q: 'banane', exclude: [] },
];

/** The ready-made comparison a product belongs to, if any ("Maslo, Mila" -> butter). */
export function presetFor(productName: string): ComparePreset | undefined {
  return COMPARE_PRESETS.find((p) =>
    matchesProductType(productName, { text: p.q, exclude: p.exclude }),
  );
}
