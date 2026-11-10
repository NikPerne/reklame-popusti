import { normalizeSearchText } from './offer.js';

/**
 * Spelling correction for searches ("malso" → "maslo"), from the words of the current offers.
 *
 * A fuzzy match on its own finds every word one letter away ("malso" matches both "maslo" and
 * "masso"), and ranks the rarer one higher. A typo is far more likely to mean a common word, so a
 * word that no product contains is replaced by its most common close neighbour.
 */

/** How many current offers contain each word (diacritic-free, lowercase). */
export type Vocabulary = ReadonlyMap<string, number>;

/** Words (letters and digits) of a search, as they are matched. */
export function searchWords(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Shorter words have too many neighbours one letter away to guess which was meant. */
const MIN_CORRECTED_LENGTH = 4;
/** Words at least this long may be two edits away from what was meant. */
const TWO_EDITS_LENGTH = 8;

/**
 * Edit distance where swapping two adjacent letters counts as one edit (optimal string
 * alignment), or `max + 1` as soon as it is certain to exceed `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prevPrev[j - 2] ?? 0) + 1);
      }
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

const checkers = new WeakMap<Vocabulary, SpellChecker>();

/** A SpellChecker for the vocabulary, reused while the repository returns the same one. */
export function spellCheckerFor(vocabulary: Vocabulary): SpellChecker {
  let checker = checkers.get(vocabulary);
  if (!checker) {
    checker = new SpellChecker(vocabulary);
    checkers.set(vocabulary, checker);
  }
  return checker;
}

/** The vocabulary's words in order, to find words that start with a search word. */
export class SpellChecker {
  private readonly sorted: string[];

  constructor(private readonly vocabulary: Vocabulary) {
    this.sorted = [...vocabulary.keys()].sort();
  }

  /** True when some product word is `word` or starts with it (a word still being typed). */
  private known(word: string): boolean {
    let low = 0;
    let high = this.sorted.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((this.sorted[mid] ?? '') < word) low = mid + 1;
      else high = mid;
    }
    return this.sorted[low]?.startsWith(word) ?? false;
  }

  /** The product word meant by `word`: itself when known, else the most common close word. */
  correctWord(word: string): string {
    if (word.length < MIN_CORRECTED_LENGTH || /\d/.test(word) || this.known(word)) return word;
    const max = word.length >= TWO_EDITS_LENGTH ? 2 : 1;
    let best: { word: string; distance: number; count: number } | undefined;
    for (const [candidate, count] of this.vocabulary) {
      const distance = editDistance(word, candidate, max);
      if (distance > max) continue;
      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && count > best.count) ||
        (distance === best.distance && count === best.count && candidate < best.word)
      ) {
        best = { word: candidate, distance, count };
      }
    }
    return best?.word ?? word;
  }

  /**
   * The search with misspelled words corrected, or undefined when nothing needed correcting.
   * The result is normalized (diacritic-free, lowercase), like the words it is matched against.
   */
  correct(text: string): string | undefined {
    const words = searchWords(text);
    const corrected = words.map((word) => this.correctWord(word));
    return corrected.some((word, i) => word !== words[i]) ? corrected.join(' ') : undefined;
  }
}
