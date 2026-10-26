import type { CategoryId } from './categories.js';
import { normalizeSearchText } from './offer.js';

/** "a|b|c" -> ["a", "b", "c"]; keeps each category's keywords on one line. */
function words(list: string): string[] {
  return list.split('|');
}

/**
 * Keyword rules for stores that don't publish usable categories (Lidl, Hofer, Eurospin). Keywords are
 * matched as word prefixes against the diacritic-free product name, in this order, so put the
 * more specific rules first (e.g. "sirup" before "sir").
 */
const RULES: [CategoryId, string[]][] = [
  // Pet products first: "Klobasice za pse" is pet food, not meat.
  ['zivali', words('za pse|za mack|pasj|macj|zival|brikete|za ptice|hisne ljubljenck')],
  ['zamrznjeno', words('zamrznjen|sladoled|ledena krema')],
  [
    'pijace',
    words(
      'pivo|vino|vina|sok|nektar|voda|caj|sirup|gin|tonic|whisky|viski|vodka|liker|napitek|pijaca|cola|radler|penin|prosecco|sampanj|energijsk|chianti|chardonnay|teran|rizling|merlot|cabernet|sauvignon|refosk|malvazij|rebula|zametovk|cvicek|pinot|tinto|traminec|muskat|spricer',
    ),
  ],
  [
    'shramba',
    words(
      'cmoki|njoki|testenin|spaget|moka|olje|oljcno|olive|oliv|kis|omak|juha|konzerv|kava|kakav|namaz|zacimb|sol |sladkor|kosmic|musli|riz|fizol|leca|cicerik|marmelad|med ',
    ),
  ],
  [
    'mlecni-izdelki',
    words(
      'mleko|mlecn|jogurt|sir|skuta|maslo|smetan|kefir|jajc|mozzarell|mocarel|parmezan|parmigiano|gorgonzol|gauda|gavda|edamec|feta|mascarpone|puding|halloumi',
    ),
  ],
  [
    'meso-ribe',
    words(
      'meso|mesn|piscan|puran|svinj|goved|telec|teletin|sunka|salam|klobas|hrenovk|prsut|slanin|panceta|cevapc|pleskavic|mleto|zrezk|file|losos|tuna|tunin|riba|ribj|kozic|lignj|klapavic|postrv|orada|brancin|skus|sardel|ramsteak|steak|pecenk|kare|bedr|peruti|stegn|golaz|pleck|plece|rebra|cordon bleu|krvavic|tlacenk|ocvirk|mortadel',
    ),
  ],
  [
    'kruh-pekovsko',
    words(
      'kruh|zemlj|rogljic|pecivo|toast|bageta|kroasan|krof|struck|pita|burek|polzek|zavitek|potica|hleb|lepinj|pletenk|krutoni',
    ),
  ],
  [
    'sladko-slano',
    words(
      'cokolad|bonbon|piskot|keks|cips|krispi|pralin|vaflj|napolitank|sladkari|lizik|gumij|smoki|kreker|oresk|orehi|arasid|lesnik|mandlj|desert|torta|kolac|zepki|kandiran|kostanj',
    ),
  ],
  [
    'sadje-zelenjava',
    words(
      'jabolk|banan|hrusk|grozdj|pomaranc|mandarin|klementin|limon|kivi|jagod|borovnic|krompir|cebul|cesen|paradiznik|kumar|paprik|solat|zelje|brokoli|cvetac|korenj|buc|gobe|sampinjon|avokad|ananas|melon|lubenic|sliv|breskv|ingver|radic|rukola|spinac|zelenjav',
    ),
  ],
  [
    'drogerija',
    words(
      'sampon|gel za tus|tus gel|zobn|krema|deodorant|dezodorant|milo|plenic|robck|britv|kozmet|parfum|lak za|vlazilni|losjon|balzam|nego|nega|obraz|serum|piling|higien',
    ),
  ],
  [
    'gospodinjstvo',
    words(
      'pralni|detergent|mehcalec|cistil|pomival|vrec|folij|kuhinjsk|lonec|loncek|ponev|posod|pekac|cedil|krpa|krpe|toaletni papir|papirnate brisac|silvercrest|wc|obesank|disece|sesalnik|kuhalnik|dzezv|skodelic|kozarc|vzigalnik',
    ),
  ],
  ['otroci', words('otrosk|igrac|dojenc|lupilu|otrok|druzabn|sestavljank|kahlic|previjal')],
  [
    'oblacila',
    words(
      'majic|hlac|nogavic|pulover|jakna|jopic|cevlj|copat|perilo|pizam|oblacil|crivit|esmara|livergy|bunda|kapa|rokavic|boksaric|skornj|brezrokavnik|pajkic',
    ),
  ],
  [
    'tehnika',
    words(
      'slusalk|polnilec|polnilnik|kabel|baterij|usb|zvocnik|elektricn|led luc|zarnic|led-zarnic',
    ),
  ],
  [
    'dom-vrt',
    words(
      'parkside|vrt|orodj|svetil|svetlobn|svec|okras|dekorac|livarno|odej|blazin|prevlek|lezisc|rastlin|cvet|krizantem|ciklam|vres|orhidej|aranzma|avto|vijac|kljuc|brusil|klesc|kompresor',
    ),
  ],
];

const FOOD_CATEGORIES = new Set<CategoryId>([
  'zamrznjeno',
  'pijace',
  'mlecni-izdelki',
  'meso-ribe',
  'kruh-pekovsko',
  'sladko-slano',
  'sadje-zelenjava',
  'shramba',
]);

/** Where a name's head ends: "Keksi (z mlekom)", "Štručka s česnovim maslom", "Tuna v olju". */
const MODIFIER = /\s\(|\s(?:z|s|v|iz|brez|na)\s/;

function matches(text: string, keyword: string): boolean {
  // Keyword at the start of a word ("sir" matches "sirni" but not "pasiran").
  return text.startsWith(keyword) || text.includes(` ${keyword}`);
}

function firstMatch(text: string, kind: 'food' | 'nonfood' | 'any'): CategoryId | undefined {
  for (const [category, keywords] of RULES) {
    // Pet products can come from either side of a store's food/non-food split.
    if (kind === 'food' && !FOOD_CATEGORIES.has(category) && category !== 'zivali') continue;
    if (kind === 'nonfood' && FOOD_CATEGORIES.has(category)) continue;
    if (keywords.some((k) => matches(text, k))) return category;
  }
  return undefined;
}

/**
 * Guesses a category from free text. The head of the name (before "z", "s", "v", ...) decides
 * first, so "Keksi z mlekom" is a sweet, not a dairy product. `kind` limits the result to food
 * or non-food categories when the store tells us which one it is; `fallback` is used when no
 * rule matches.
 */
export function guessCategory(
  text: string,
  kind: 'food' | 'nonfood' | 'any',
  fallback: CategoryId,
): CategoryId {
  const normalized = `${normalizeSearchText(text)} `;
  const head = normalized.split(MODIFIER)[0] ?? normalized;
  return firstMatch(head, kind) ?? firstMatch(normalized, kind) ?? fallback;
}
